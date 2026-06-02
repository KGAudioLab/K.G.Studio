import type { StreamChunk } from './StreamingTypes';
import type { Message, ToolCall } from '../core/AgentState';
import type { OpenAIToolDefinition } from '../tools/BaseTool';
import { LocalLLMModelManager } from '../../util/localLLMModelManager';
import {
  formatToolCall,
  formatToolDeclaration,
  formatToolResponse,
  parseToolCalls,
  stripToolProtocol,
} from './gemmaToolProtocol';
import {
  LOCAL_LLM_DEFAULT_CONTEXT_LENGTH,
  LOCAL_LLM_MODEL_FILENAME,
  LOCAL_LLM_DEFAULT_MODEL_URL,
  normalizeLocalLLMContextLength,
} from '../../util/localLLMConfig';
import { LocalLLMModelCache } from '../../util/localLLMModelCache';
import type { LLMProvider } from './LLMProvider';
import { ConfigManager } from '../../core/config/ConfigManager';

type MediaPipeGenAI = {
  FilesetResolver: {
    forGenAiTasks(basePath: string): Promise<unknown>;
  };
  LlmInference: {
    createFromOptions(fileset: unknown, options: Record<string, unknown>): Promise<GemmaInference>;
  };
};

type GemmaInference = {
  generateResponse(
    prompt: string,
    callback: (partial: string, done: boolean) => void,
  ): Promise<void> | void;
  sizeInTokens(text: string): number;
  close?: () => void;
};

interface PromptTemplatePart {
  pre: string;
  post: string;
}

const PROMPT_TEMPLATE: Record<'user' | 'model' | 'system', PromptTemplatePart> = {
  user: { pre: '<|turn>user\n', post: '<turn|>\n' },
  model: { pre: '<|turn>model\n', post: '<turn|>\n' },
  system: { pre: '<|turn>system\n', post: '<turn|>\n' },
};

async function importMediaPipe(): Promise<MediaPipeGenAI> {
  const bundleUrl = new URL(`${import.meta.env.BASE_URL}mediapipe/genai_bundle.mjs`, window.location.origin).href;
  return import(/* @vite-ignore */ bundleUrl) as Promise<MediaPipeGenAI>;
}

export class LocalBrowserLLMProvider implements LLMProvider {
  private inference: GemmaInference | null = null;

  getPreferredSystemPromptPath(): string | undefined {
    return 'prompts/system_compact.md';
  }

  getContextWindow(): number {
    return this.getConfiguredContextLength();
  }

  getReservedOutputTokens(): number {
    const contextWindow = this.getConfiguredContextLength();
    return Math.max(1024, Math.min(4096, Math.floor(contextWindow * 0.1)));
  }

  async estimateHistoryTokens(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): Promise<number> {
    const inference = await this.ensureInference();
    const prompt = this.renderPrompt(messages, systemPrompt, tools);
    return inference.sizeInTokens(prompt);
  }

  isContextTooLongError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return /context|token|maxTokens|kv-cache|too long|overflow/i.test(error.message);
  }

  private async ensureInference(): Promise<GemmaInference> {
    await LocalLLMModelManager.ensureRuntimeSupported();
    if (this.inference) {
      return this.inference;
    }

    const maxTokens = this.getConfiguredContextLength();
    const modelUrl = this.getConfiguredModelUrl();
    console.log(`[localLLM] Initializing with max context length: ${maxTokens} tokens`);

    const [{ FilesetResolver, LlmInference }, modelLoad] = await Promise.all([
      this.getMediaPipeModule(),
      LocalLLMModelCache.loadModelReaderWithCache(
        modelUrl,
        LOCAL_LLM_MODEL_FILENAME,
        progress => {
          LocalLLMModelManager.notifyLoadProgress(progress.receivedBytes, progress.totalBytes, progress.fromCache);
        },
      ),
    ]);

    LocalLLMModelManager.notifyLoadStart(modelLoad.fromCache);
    console.log('[localLLM] Model stream prepared for MediaPipe.', {
      filename: LOCAL_LLM_MODEL_FILENAME,
      totalBytes: modelLoad.totalBytes,
      fromCache: modelLoad.fromCache,
    });

    const fileset = await FilesetResolver.forGenAiTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
    console.log('[localLLM] MediaPipe fileset resolved. Creating inference engine...');
    try {
      this.inference = await LlmInference.createFromOptions(fileset, {
        baseOptions: {
          modelAssetBuffer: modelLoad.reader,
        },
        numResponses: 1,
        maxTokens,
        topK: 64,
        temperature: 1.0,
      });
      console.log('[localLLM] MediaPipe inference engine created successfully.');
      if (modelLoad.cacheWritePromise) {
        void modelLoad.cacheWritePromise.then(() => {
          LocalLLMModelManager.notifyCacheReady();
        }).catch(error => {
          console.error('[localLLM] Background cache write failed after inference creation.', error);
          LocalLLMModelManager.notifyLoadError(error);
        });
      } else {
        LocalLLMModelManager.notifyCacheReady();
      }
      return this.inference;
    } catch (error) {
      LocalLLMModelManager.notifyLoadError(error);
      throw error;
    }
  }

  private async getMediaPipeModule(): Promise<MediaPipeGenAI> {
    return importMediaPipe();
  }

  private getConfiguredContextLength(): number {
    try {
      const configManager = ConfigManager.instance();
      return normalizeLocalLLMContextLength(
        configManager.get('general.local_browser.context_length'),
      );
    } catch {
      return LOCAL_LLM_DEFAULT_CONTEXT_LENGTH;
    }
  }

  private getConfiguredModelUrl(): string {
    try {
      const configManager = ConfigManager.instance();
      const configured = configManager.get('general.local_browser.model_url');
      return typeof configured === 'string' && configured.trim() ? configured : LOCAL_LLM_DEFAULT_MODEL_URL;
    } catch {
      return LOCAL_LLM_DEFAULT_MODEL_URL;
    }
  }

  private applyTemplate(message: { role: 'user' | 'model'; text: string }): string {
    const template = PROMPT_TEMPLATE[message.role];
    return `${template.pre}${message.text}${template.post}`;
  }

  private renderPrompt(
    messages: Message[],
    systemPrompt: string | undefined,
    tools: OpenAIToolDefinition[] | undefined,
  ): string {
    const thinkPrefix = '<|think|>';
    const toolDeclarations = (tools ?? []).map(formatToolDeclaration).join('');
    const systemContent = `${thinkPrefix}${systemPrompt ?? ''}${toolDeclarations}`;
    const systemSection = systemContent
      ? `${PROMPT_TEMPLATE.system.pre}${systemContent}${PROMPT_TEMPLATE.system.post}`
      : '';

    const conversationParts: string[] = [];

    for (let i = 0; i < messages.length; i += 1) {
      const message = messages[i];
      if (message.role === 'user') {
        conversationParts.push(this.applyTemplate({ role: 'user', text: message.content ?? '' }));
        continue;
      }

      if (message.role === 'assistant') {
        let modelText = message.content ?? '';
        if (message.tool_calls?.length) {
          for (const toolCall of message.tool_calls) {
            modelText += formatToolCall(toolCall.function.name, toolCall.function.arguments);
          }

          let scanIndex = i + 1;
          while (scanIndex < messages.length && messages[scanIndex].role === 'tool') {
            const toolMessage = messages[scanIndex];
            const matchedCall = message.tool_calls.find(call => call.id === toolMessage.tool_call_id);
            if (matchedCall) {
              let parsedResult: unknown = toolMessage.content ?? '';
              try {
                parsedResult = JSON.parse(toolMessage.content ?? '{}');
              } catch {
                parsedResult = toolMessage.content ?? '';
              }
              modelText += formatToolResponse(matchedCall.function.name, parsedResult);
            }
            scanIndex += 1;
          }
        }

        conversationParts.push(this.applyTemplate({ role: 'model', text: modelText }));
      }
    }

    return `${systemSection}${conversationParts.join('')}${PROMPT_TEMPLATE.model.pre}`;
  }

  async *generateStream(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): AsyncIterableIterator<StreamChunk> {
    const inference = await this.ensureInference();
    const prompt = this.renderPrompt(messages, systemPrompt, tools);
    console.log('------------ LOCAL RAW PROMPT ------------');
    console.log(prompt);
    console.log('------------------------------------------');

    const start = performance.now();
    let firstTokenTime: number | null = null;
    let rawResponse = '';
    let streamedVisibleText = '';
    const pendingTextDeltas: string[] = [];
    let generationError: unknown = null;
    let generationDone = false;
    let notifyWaiting: (() => void) | null = null;

    const wake = () => {
      if (notifyWaiting) {
        const resolve = notifyWaiting;
        notifyWaiting = null;
        resolve();
      }
    };

    const generationPromise = new Promise<void>((resolve, reject) => {
      try {
        const result = inference.generateResponse(prompt, (partial, done) => {
          if (firstTokenTime === null) {
            firstTokenTime = performance.now();
          }
          rawResponse += partial;

          const visibleText = stripToolProtocol(rawResponse);
          if (visibleText.startsWith(streamedVisibleText)) {
            const delta = visibleText.slice(streamedVisibleText.length);
            if (delta) {
              streamedVisibleText = visibleText;
              pendingTextDeltas.push(delta);
              wake();
            }
          } else if (visibleText && visibleText !== streamedVisibleText) {
            const delta = visibleText.slice(streamedVisibleText.length) || visibleText;
            streamedVisibleText = visibleText;
            pendingTextDeltas.push(delta);
            wake();
          }

          if (done) {
            generationDone = true;
            wake();
            setTimeout(resolve, 0);
          }
        });

        Promise.resolve(result).catch(error => {
          generationError = error;
          generationDone = true;
          wake();
          reject(error);
        });
      } catch (error) {
        generationError = error;
        generationDone = true;
        wake();
        reject(error);
      }
    });

    while (!generationDone || pendingTextDeltas.length > 0) {
      while (pendingTextDeltas.length > 0) {
        const delta = pendingTextDeltas.shift();
        if (delta) {
          yield { type: 'text', content: delta };
        }
      }

      if (generationDone) {
        break;
      }

      await new Promise<void>(resolve => {
        notifyWaiting = resolve;
      });
    }

    await generationPromise;
    if (generationError) {
      throw generationError;
    }

    console.log('------------ LOCAL RAW RESPONSE ------------');
    console.log(rawResponse);
    console.log('--------------------------------------------');

    const toolCalls = parseToolCalls(rawResponse);
    const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';

    const promptTokenCount = inference.sizeInTokens(prompt);
    const generatedTokenCount = inference.sizeInTokens(rawResponse);
    const totalEnd = performance.now();
    const prefillMs = firstTokenTime !== null ? firstTokenTime - start : 0;
    const decodeMs = Math.max(0, totalEnd - start - prefillMs);
    const prefillTps = prefillMs > 0 ? promptTokenCount / (prefillMs / 1000) : 0;
    const generationTps = decodeMs > 0 ? generatedTokenCount / (decodeMs / 1000) : 0;
    console.log(`[localLLM] prefill t/s: ${prefillTps.toFixed(1)}`);
    console.log(`[localLLM] generation t/s: ${generationTps.toFixed(1)}`);

    for (const parsed of toolCalls) {
      const toolCall: ToolCall = {
        id: `gemma_tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: 'function',
        function: {
          name: parsed.name,
          arguments: JSON.stringify(parsed.args),
        },
      };
      yield { type: 'tool_call', content: '', toolCall };
    }

    yield {
      type: 'done',
      content: '',
      finishReason,
      performanceInfo: {
        prefillTps,
        generationTps,
      },
    };
  }
}
