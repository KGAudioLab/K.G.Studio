import { LLMProvider } from './LLMProvider';
import type { StreamChunk, LLMResponse } from './StreamingTypes';
import type { Message } from '../core/AgentState';
import { ConfigManager } from '../../core/config/ConfigManager';
import { URL_CONSTANTS } from '../../constants/coreConstants';

/**
 * OpenAI API provider implementation
 */
export class OpenAIProvider extends LLMProvider {
  readonly name = 'OpenAI';
  
  private isOllamaFormat: boolean | null = null; // Detected at runtime
  
  constructor() {
    super();
  }

  /**
   * Get current configuration values from ConfigManager
   */
  private getCurrentConfig() {
    const configManager = ConfigManager.instance();
    const llmProvider = configManager.get('general.llm_provider') as string;
    const isCompatibleProvider = llmProvider === 'openai_compatible';
    
    if (isCompatibleProvider) {
      const apiKey = configManager.get('general.openai_compatible.api_key') as string;
      const model = configManager.get('general.openai_compatible.model') as string;
      const baseURL = configManager.get('general.openai_compatible.base_url') as string;
      // For compatible providers, use the full URL as provided (assume it includes the endpoint)
      // Common patterns: http://localhost:11434/api/chat (Ollama), https://api.openrouter.ai/v1 (OpenRouter)
      const apiEndpoint = baseURL;
      const flexMode = false; // Not applicable to compatible providers
      
      return { apiKey, model, baseURL, apiEndpoint, flexMode, isCompatibleProvider };
    } else {
      const apiKey = configManager.get('general.openai.api_key') as string;
      const model = configManager.get('general.openai.model') as string;
      const flexMode = (configManager.get('general.openai.flex') as boolean) === true;
      const baseURL = URL_CONSTANTS.DEFAULT_OPENAI_BASE_URL;
      const apiEndpoint = `${baseURL}/chat/completions`;
      
      return { apiKey, model, baseURL, apiEndpoint, flexMode, isCompatibleProvider };
    }
  }

  /**
   * Detect if the response uses Ollama's raw JSON format or OpenAI's SSE format
   */
  private detectStreamFormat(firstChunk: string): boolean {
    // If it starts with "data: ", it's OpenAI SSE format
    if (firstChunk.trim().startsWith('data: ')) {
      return false; // Not Ollama format
    }
    
    // Try to parse as JSON - if successful and has 'done' field, it's Ollama format
    try {
      const json = JSON.parse(firstChunk.trim());
      return typeof json.done === 'boolean';
    } catch {
      return false; // Not valid JSON, assume OpenAI format
    }
  }

  /**
   * Parse Ollama's raw JSON chunk format
   */
  private parseOllamaChunk(chunk: string): { thinking?: string; content?: string; isDone?: boolean; toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }> } {
    try {
      const json = JSON.parse(chunk.trim());
      const thinking: string | undefined = json.message?.thinking;
      const content: string | undefined = json.message?.content || json.response; // Handle both chat and completion formats
      type WireToolCall = { function?: { name?: unknown; arguments?: unknown } };
      const toolCallsRaw: unknown[] | undefined = json.message?.tool_calls as unknown[] | undefined;
      const toolCalls = Array.isArray(toolCallsRaw)
        ? (toolCallsRaw
            .map((tc: unknown) => {
              const wire = tc as WireToolCall;
              const fn = wire?.function;
              if (!fn || typeof fn.name !== 'string') return null;
              const args = fn.arguments;
              if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
              return { name: fn.name, arguments: args as Record<string, unknown> };
            })
            .filter((v): v is { name: string; arguments: Record<string, unknown> } => v !== null))
        : undefined;
      return {
        thinking,
        content,
        isDone: json.done === true,
        toolCalls
      };
    } catch {
      return {}; // Invalid JSON, return empty object
    }
  }

  /**
   * Parse OpenAI's SSE format chunk
   */
  private parseOpenAIChunk(line: string): { thinking?: string; content?: string; isDone?: boolean; toolCallDelta?: Array<{ index?: number; function?: { name?: string; arguments?: string } }> } {
    if (!line.startsWith('data: ')) {
      return {};
    }

    const data = line.slice(6);
    if (data === '[DONE]') {
      return { isDone: true };
    }

    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta;
      const thinking: string | undefined = delta?.thinking; // Some providers may stream "thinking"
      const content: string | undefined = delta?.content;
      const tcd = delta?.tool_calls;
      const toolCallDelta: Array<{ index?: number; function?: { name?: string; arguments?: string } }> | undefined = Array.isArray(tcd)
        ? (tcd as Array<{ index?: number; function?: { name?: string; arguments?: string } }>)
        : undefined;
      return { thinking, content, isDone: false, toolCallDelta };
    } catch {
      return {}; // Skip invalid JSON lines
    }
  }
  
  async *generateStream(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): AsyncIterableIterator<StreamChunk> {
    // Get fresh config values
    const config = this.getCurrentConfig();
    
    // Build OpenAI messages array with role preservation
    const openAIMessages: Array<{ role: string; content: string }> = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      openAIMessages.push({ role: 'system', content: systemPrompt });
    }
    
    // Add conversation history with preserved roles
    openAIMessages.push(...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        ...(config.flexMode && !config.isCompatibleProvider ? { service_tier: 'flex' } : {}),
        messages: openAIMessages,
        stream: true,
        tools: tools || undefined
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkProcessed = false;
    let lastSegmentType: 'thinking' | 'content' | null = null;
    const pendingFunctionCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const openAIToolCallBuilders: Record<number, { name?: string; argumentsText: string }> = {};

    const escapeXml = (text: string): string =>
      String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const functionCallToXml = (name: string, args: Record<string, unknown>): string => {
      const keys = Object.keys(args);
      const inner = keys
        .map((k) => {
          const value = (args as Record<string, unknown>)[k];
          const text = typeof value === 'string' ? value : JSON.stringify(value);
          return `<${k}>${escapeXml(text)}</${k}>`;
        })
        .join('\n');
      return `<${name}>\n${inner}\n</${name}>`;
    };
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // For Ollama format, we need to split by newlines for JSON objects
        // For OpenAI format, we also split by newlines for SSE
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          // Detect format on first non-empty chunk
          if (!firstChunkProcessed) {
            this.isOllamaFormat = this.detectStreamFormat(trimmedLine);
            firstChunkProcessed = true;
          }
          
          if (this.isOllamaFormat) {
            const { thinking, content, isDone, toolCalls } = this.parseOllamaChunk(trimmedLine);
            if (isDone) {
              // Append any pending or current tool calls as XML before finishing
              const allToolCalls = [
                ...pendingFunctionCalls,
                ...(toolCalls || [])
              ];
              if (allToolCalls.length > 0) {
                const xmlBlocks = allToolCalls
                  .map((tc) => `\n${functionCallToXml(tc.name, tc.arguments)}\n`)
                  .join('');
                yield { type: 'text', content: xmlBlocks };
              }
              yield { type: 'done', content: '' };
              return;
            }

            if (typeof thinking === 'string' && thinking.length > 0) {
              if (lastSegmentType && lastSegmentType !== 'thinking') {
                yield { type: 'text', content: '\n\n' };
              }
              yield { type: 'text', content: thinking };
              lastSegmentType = 'thinking';
            }

            if (typeof content === 'string' && content.length > 0) {
              if (lastSegmentType && lastSegmentType !== 'content') {
                yield { type: 'text', content: '\n\n' };
              }
              yield { type: 'text', content: content };
              lastSegmentType = 'content';
            }

            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              // Accumulate and append at the end of stream
              pendingFunctionCalls.push(...toolCalls);
            }
            continue;
          }

          const { thinking, content, isDone, toolCallDelta } = this.parseOpenAIChunk(trimmedLine);
          if (isDone) {
            // Finalize any accumulated OpenAI tool calls and emit XML
            const finalizedToolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
            for (const indexStr of Object.keys(openAIToolCallBuilders)) {
              const idx = Number(indexStr);
              const builder = openAIToolCallBuilders[idx];
              if (!builder || !builder.name) continue;
              let argsObj: Record<string, unknown> | null = null;
              if (builder.argumentsText) {
                try {
                  argsObj = JSON.parse(builder.argumentsText);
                } catch {
                  argsObj = null;
                }
              }
              if (argsObj) {
                finalizedToolCalls.push({ name: builder.name, arguments: argsObj });
              }
            }

            const allToolCalls = [...pendingFunctionCalls, ...finalizedToolCalls];
            if (allToolCalls.length > 0) {
              const xmlBlocks = allToolCalls
                .map((tc) => `\n${functionCallToXml(tc.name, tc.arguments)}\n`)
                .join('');
              yield { type: 'text', content: xmlBlocks };
            }
            yield { type: 'done', content: '' };
            return;
          }
          
          if (typeof thinking === 'string' && thinking.length > 0) {
            if (lastSegmentType && lastSegmentType !== 'thinking') {
              yield { type: 'text', content: '\n\n' };
            }
            yield { type: 'text', content: thinking };
            lastSegmentType = 'thinking';
          }

          if (typeof content === 'string' && content.length > 0) {
            if (lastSegmentType && lastSegmentType !== 'content') {
              yield { type: 'text', content: '\n\n' };
            }
            yield { type: 'text', content };
            lastSegmentType = 'content';
          }

          if (Array.isArray(toolCallDelta) && toolCallDelta.length > 0) {
            for (const tc of toolCallDelta) {
              const index: number = typeof tc.index === 'number' ? tc.index : 0;
              if (!openAIToolCallBuilders[index]) {
                openAIToolCallBuilders[index] = { argumentsText: '' };
              }
              const fn = tc.function;
              if (fn) {
                if (typeof fn.name === 'string') {
                  openAIToolCallBuilders[index].name = fn.name;
                }
                if (typeof fn.arguments === 'string') {
                  openAIToolCallBuilders[index].argumentsText += fn.arguments;
                }
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  async generateCompletion(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): Promise<LLMResponse> {
    // Get fresh config values
    const config = this.getCurrentConfig();
    
    // Build OpenAI messages array with role preservation
    const openAIMessages: Array<{ role: string; content: string }> = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
      openAIMessages.push({ role: 'system', content: systemPrompt });
    }
    
    // Add conversation history with preserved roles
    openAIMessages.push(...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })));

    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        ...(config.flexMode && !config.isCompatibleProvider ? { service_tier: 'flex' } : {}),
        messages: openAIMessages,
        stream: false,
        tools: tools || undefined
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();

    // Handle different response formats
    const escapeXml = (text: string): string =>
      String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const functionCallToXml = (name: string, args: Record<string, unknown>): string => {
      const keys = Object.keys(args);
      const inner = keys
        .map((k) => {
          const value = (args as Record<string, unknown>)[k];
          const text = typeof value === 'string' ? value : JSON.stringify(value);
          return `<${k}>${escapeXml(text)}</${k}>`;
        })
        .join('\n');
      return `<${name}>\n${inner}\n</${name}>`;
    };

    if (data.message) {
      // Ollama/compatible format
      const thinking: string = data.message.thinking || '';
      const contentText: string = data.message.content || data.response || '';
      const textCombined = thinking && contentText ? `${thinking}\n\n${contentText}` : (thinking || contentText);

      type WireToolCall = { function?: { name?: unknown; arguments?: unknown } };
      const toolCallsRaw: unknown[] | undefined = data.message.tool_calls as unknown[] | undefined;
      const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = Array.isArray(toolCallsRaw)
        ? (toolCallsRaw
            .map((tc: unknown) => {
              const wire = tc as WireToolCall;
              const fn = wire?.function;
              if (!fn || typeof fn.name !== 'string') return null;
              const args = fn.arguments;
              if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
              return { name: fn.name, arguments: args as Record<string, unknown> };
            })
            .filter((v): v is { name: string; arguments: Record<string, unknown> } => v !== null))
        : [];

      const xmlBlocks = toolCalls.length > 0
        ? toolCalls.map((tc) => `\n${functionCallToXml(tc.name, tc.arguments)}\n`).join('')
        : '';

      return {
        content: `${textCombined}${xmlBlocks}`,
        toolCalls: data.message.tool_calls || undefined,
        finished: data.done === true || data.done_reason === 'stop'
      };
    } else {
      // OpenAI format
      const choice = data.choices?.[0];
      const thinking: string = choice?.message?.thinking || '';
      const contentText: string = choice?.message?.content || '';
      const textCombined = thinking && contentText ? `${thinking}\n\n${contentText}` : (thinking || contentText);

      type WireToolCall2 = { function?: { name?: unknown; arguments?: unknown } };
      const toolCallsRaw: unknown[] | undefined = choice?.message?.tool_calls as unknown[] | undefined;
      const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = Array.isArray(toolCallsRaw)
        ? (toolCallsRaw
            .map((tc: unknown) => {
              const wire = tc as WireToolCall2;
              const fn = wire?.function;
              if (!fn || typeof fn.name !== 'string') return null;
              const args = fn.arguments;
              if (args === null || typeof args !== 'object' || Array.isArray(args)) return null;
              return { name: fn.name, arguments: args as Record<string, unknown> };
            })
            .filter((v): v is { name: string; arguments: Record<string, unknown> } => v !== null))
        : [];

      const xmlBlocks = toolCalls.length > 0
        ? toolCalls.map((tc) => `\n${functionCallToXml(tc.name, tc.arguments)}\n`).join('')
        : '';

      return {
        content: `${textCombined}${xmlBlocks}`,
        toolCalls: choice?.message?.tool_calls || undefined,
        finished: choice?.finish_reason === 'stop' || choice?.finish_reason === 'tool_calls'
      };
    }
  }
}