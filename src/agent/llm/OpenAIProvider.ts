import { LLMProvider } from './LLMProvider';
import type { StreamChunk } from './StreamingTypes';
import type { Message } from '../core/AgentState';
import { ConfigManager } from '../../core/config/ConfigManager';
import { URL_CONSTANTS } from '../../constants/coreConstants';
import { LLM_PROTOCOL } from '../../constants/llmConstants';

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
   * Build OpenAI-compatible messages array from input messages and system prompt
   */
  private buildRequestMessages(messages: Message[], systemPrompt?: string): Array<{ role: string; content: string }> {
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

    return openAIMessages;
  }

  /**
   * Create API request with proper headers and body
   */
  private async createApiRequest(messages: Array<{ role: string; content: string }>, config: ReturnType<typeof this.getCurrentConfig>, streaming: boolean): Promise<Response> {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        ...(config.flexMode && !config.isCompatibleProvider ? { service_tier: 'flex' } : {}),
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
   * Process thinking and content chunks, yielding appropriate StreamChunks
   */
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