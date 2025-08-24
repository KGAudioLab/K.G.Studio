import { LLMProvider } from './LLMProvider';
import type { StreamChunk } from './StreamingTypes';
import type { Message } from '../core/AgentState';
import { ConfigManager } from '../../core/config/ConfigManager';
import { LLM_PROTOCOL } from '../../constants/llmConstants';

/**
 * Claude (via OpenRouter) provider using the OpenAI-compatible Chat Completions API.
 * Difference from the generic OpenAI provider: message content is an array of parts
 * with a single text item per message (future-ready for images, tools, etc.).
 */
export class ClaudeOpenRouterProvider extends LLMProvider {
  readonly name = 'Claude (OpenRouter)';

  private isOllamaFormat: boolean | null = null; // Detected at runtime

  constructor() {
    super();
  }

  /**
   * Build OpenAI-compatible messages array where each message content is an array of parts.
   */
  private buildRequestMessages(messages: Message[], systemPrompt?: string): Array<{ role: string; content: Array<{ type: 'text'; text: string }> }> {
    const openAIMessages: Array<{ role: string; content: Array<{ type: 'text'; text: string }> }> = [];

    // Add system prompt if provided
    if (systemPrompt) {
      openAIMessages.push({ role: 'system', content: [{ type: 'text', text: systemPrompt }] });
    }

    // Add conversation history with preserved roles
    openAIMessages.push(
      ...messages.map(msg => ({
        role: msg.role,
        content: [{ type: 'text' as const, text: msg.content }]
      }))
    );

    return openAIMessages;
  }

  /**
   * Create API request with proper headers and body
   */
  private async createApiRequest(messages: Array<{ role: string; content: Array<{ type: 'text'; text: string }> }>, config: ReturnType<typeof this.getCurrentConfig>, streaming: boolean): Promise<Response> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    };

    // Optional, but recommended by OpenRouter docs to set referer/title for attribution
    // if (typeof window !== 'undefined') {
    //   headers['HTTP-Referer'] = window.location.origin;
    //   headers['X-Title'] = 'K.G.Studio';
    // }

    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: streaming,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`${this.name} API request failed (${response.status}): ${response.statusText}. ${errorText}`);
    }

    return response;
  }

  /**
   * Get current configuration values from ConfigManager
   */
  private getCurrentConfig() {
    const configManager = ConfigManager.instance();
    const apiKey = configManager.get('general.claude_openrouter.api_key') as string;
    const model = configManager.get('general.claude_openrouter.model') as string;
    const baseURL = configManager.get('general.claude_openrouter.base_url') as string;
    // baseURL is the full API endpoint for OpenRouter (e.g., https://openrouter.ai/api/v1/chat/completions)
    const apiEndpoint = baseURL;
    return { apiKey, model, baseURL, apiEndpoint };
  }

  /**
   * Detect if the response uses Ollama's raw JSON format or OpenAI's SSE format
   */
  private detectStreamFormat(firstChunk: string): boolean {
    // If it starts with "data: ", it's OpenAI SSE format
    if (firstChunk.trim().startsWith(LLM_PROTOCOL.SSE_DATA_PREFIX)) {
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
  private parseOllamaChunk(chunk: string): { thinking?: string; content?: string; isDone?: boolean } {
    try {
      const json = JSON.parse(chunk.trim());
      const thinking: string | undefined = json.message?.thinking;
      const content: string | undefined = json.message?.content || json.response; // Handle both chat and completion formats
      return {
        thinking,
        content,
        isDone: json.done === true
      };
    } catch {
      return {}; // Invalid JSON, return empty object
    }
  }

  /**
   * Parse OpenAI's SSE format chunk
   */
  private parseOpenAIChunk(line: string): { thinking?: string; content?: string; isDone?: boolean } {
    if (!line.startsWith(LLM_PROTOCOL.SSE_DATA_PREFIX)) {
      return {};
    }

    const data = line.slice(LLM_PROTOCOL.SSE_DATA_PREFIX.length);
    if (data === LLM_PROTOCOL.SSE_DONE_MARKER) {
      return { isDone: true };
    }

    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta;
      const thinking: string | undefined = delta?.thinking; // Some providers may stream "thinking"
      const content: string | undefined = delta?.content;
      return { thinking, content, isDone: false };
    } catch {
      return {}; // Skip invalid JSON lines
    }
  }

  private async *processContentChunk(
    thinking: string | undefined,
    content: string | undefined,
    lastSegmentType: { current: 'thinking' | 'content' | null }
  ): AsyncIterableIterator<StreamChunk> {
    if (typeof thinking === 'string' && thinking.length > 0) {
      if (lastSegmentType.current && lastSegmentType.current !== 'thinking') {
        yield { type: 'text', content: LLM_PROTOCOL.SEGMENT_SEPARATOR };
      }
      yield { type: 'text', content: thinking };
      lastSegmentType.current = 'thinking';
    }

    if (typeof content === 'string' && content.length > 0) {
      if (lastSegmentType.current && lastSegmentType.current !== 'content') {
        yield { type: 'text', content: LLM_PROTOCOL.SEGMENT_SEPARATOR };
      }
      yield { type: 'text', content: content };
      lastSegmentType.current = 'content';
    }
  }

  async *generateStream(
    messages: Message[],
    systemPrompt?: string
  ): AsyncIterableIterator<StreamChunk> {
    const config = this.getCurrentConfig();
    const requestMessages = this.buildRequestMessages(messages, systemPrompt);
    const response = await this.createApiRequest(requestMessages, config, true);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`${this.name} streaming: Failed to get response reader from API response`);
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let firstChunkProcessed = false;
    const lastSegmentType = { current: null as 'thinking' | 'content' | null };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by newlines for SSE (and also works for line-delimited JSON)
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

          const { thinking, content, isDone } = this.isOllamaFormat
            ? this.parseOllamaChunk(trimmedLine)
            : this.parseOpenAIChunk(trimmedLine);

          if (isDone) {
            yield { type: 'done', content: '' };
            return;
          }

          yield* this.processContentChunk(thinking, content, lastSegmentType);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}


