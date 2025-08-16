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
      return { thinking, content, isDone: false };
    } catch {
      return {}; // Skip invalid JSON lines
    }
  }
  
  async *generateStream(
    messages: Message[], 
    systemPrompt?: string
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
            const { thinking, content, isDone } = this.parseOllamaChunk(trimmedLine);
            if (isDone) {
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

            continue;
          }

          const { thinking, content, isDone } = this.parseOpenAIChunk(trimmedLine);
          if (isDone) {
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
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  async generateCompletion(
    messages: Message[], 
    systemPrompt?: string
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
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();

    // Handle different response formats

    if (data.message) {
      // Ollama/compatible format
      const thinking: string = data.message.thinking || '';
      const contentText: string = data.message.content || data.response || '';
      const textCombined = thinking && contentText ? `${thinking}\n\n${contentText}` : (thinking || contentText);

      return {
        content: textCombined,
        finished: data.done === true || data.done_reason === 'stop'
      };
    } else {
      // OpenAI format
      const choice = data.choices?.[0];
      const thinking: string = choice?.message?.thinking || '';
      const contentText: string = choice?.message?.content || '';
      const textCombined = thinking && contentText ? `${thinking}\n\n${contentText}` : (thinking || contentText);

      return {
        content: textCombined,
        finished: choice?.finish_reason === 'stop'
      };
    }
  }
}