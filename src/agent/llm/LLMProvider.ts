import OpenAI from 'openai';
import type { StreamChunk } from './StreamingTypes';
import type { Message, ToolCall } from '../core/AgentState';
import type { OpenAIToolDefinition } from '../tools/BaseTool';
import { getModelTokenLimits } from './modelTokenLimits';

export interface LLMProvider {
  getPreferredSystemPromptPath?(): string | undefined;
  getContextWindow?(): number | undefined;
  getReservedOutputTokens?(): number | undefined;
  estimateHistoryTokens?(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): Promise<number> | number;
  isContextTooLongError?(error: unknown): boolean;
  generateStream(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): AsyncIterableIterator<StreamChunk>;
}

function extractErrorDetails(error: unknown): { code?: string; message?: string } {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const asRecord = error as Record<string, unknown>;
  const nestedError = asRecord.error && typeof asRecord.error === 'object'
    ? asRecord.error as Record<string, unknown>
    : undefined;
  const code = typeof asRecord.code === 'string'
    ? asRecord.code
    : typeof nestedError?.code === 'string'
      ? nestedError.code
      : undefined;
  const message = typeof asRecord.message === 'string'
    ? asRecord.message
    : typeof nestedError?.message === 'string'
      ? nestedError.message
      : undefined;
  return { code, message };
}

/**
 * OpenAI-compatible provider implementation.
 * Works with OpenAI and OpenAI-compatible APIs (OpenRouter, Ollama, vLLM, etc.)
 */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    const normalizedBaseURL = baseURL?.replace(/\/chat\/completions\/?$/, '') || undefined;

    this.client = new OpenAI({
      apiKey,
      ...(normalizedBaseURL ? { baseURL: normalizedBaseURL } : {}),
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  getContextWindow(): number | undefined {
    return getModelTokenLimits(this.model)?.contextWindow;
  }

  getReservedOutputTokens(): number | undefined {
    const limits = getModelTokenLimits(this.model);
    if (!limits) {
      return undefined;
    }

    if (typeof limits.reservedOutputTokens === 'number') {
      return limits.reservedOutputTokens;
    }

    if (typeof limits.maxOutputTokens === 'number') {
      return Math.min(limits.maxOutputTokens, 8_192);
    }

    return undefined;
  }

  estimateHistoryTokens(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): number {
    const openaiMessages = this.convertMessages(messages, systemPrompt);
    const payload = JSON.stringify({
      model: this.model,
      messages: openaiMessages,
      tools: tools ?? [],
    });

    // Conservative browser-side estimate for preflight checks.
    return Math.ceil(payload.length / 3);
  }

  isContextTooLongError(error: unknown): boolean {
    const { code, message } = extractErrorDetails(error);
    if (code === 'context_length_exceeded') {
      return true;
    }

    return typeof message === 'string'
      && /context window|maximum context length|input exceeds the context window|context too long/i.test(message);
  }

  private convertMessages(
    messages: Message[],
    systemPrompt?: string,
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content ?? '' });
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content ?? null,
        };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        result.push(assistantMsg);
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id!,
          content: msg.content ?? '',
        });
      }
    }

    return result;
  }

  async *generateStream(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): AsyncIterableIterator<StreamChunk> {
    const openaiMessages = this.convertMessages(messages, systemPrompt);

    const requestParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: openaiMessages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools as unknown as OpenAI.ChatCompletionTool[];
      requestParams.tool_choice = 'auto';
    }

    const stream = await this.client.chat.completions.create(requestParams);
    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = 'stop';

    for await (const chunk of stream) {
      // Do not delete: leave this commented out for future debugging purpose.
      // console.log('LLMProvider: chunk', JSON.stringify(chunk));
      const choice = chunk.choices[0];
      if (!choice) continue;

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta = choice.delta;
      if (delta.content) {
        yield { type: 'text', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallAccumulator.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
      }
    }

    if (toolCallAccumulator.size > 0) {
      for (const [, tc] of toolCallAccumulator) {
        const toolCall: ToolCall = {
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        };
        yield { type: 'tool_call', content: '', toolCall };
      }
    }

    yield { type: 'done', content: '', finishReason };
  }
}
