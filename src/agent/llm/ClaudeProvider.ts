import { LLMProvider } from './LLMProvider';
import type { StreamChunk } from './StreamingTypes';
import type { Message } from '../core/AgentState';
import { ConfigManager } from '../../core/config/ConfigManager';

/**
 * Anthropic Claude API provider implementation
 */
export class ClaudeProvider extends LLMProvider {
  readonly name = 'Claude';
  
  private apiKey: string;
  private model: string;
  private baseURL: string = 'https://api.anthropic.com';
  private apiEndpoint: string;
  
  constructor() {
    super();
    
    const configManager = ConfigManager.instance();
    this.apiKey = configManager.get('general.claude.api_key') as string;
    this.model = configManager.get('general.claude.model') as string;
    this.apiEndpoint = `${this.baseURL}/v1/messages`;
  }

  /**
   * Convert internal messages to Claude's format
   */
  private convertMessages(messages: Message[], systemPrompt?: string): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    claudeMessages.push(...messages.map(msg => ({ role: msg.role, content: msg.content })));
    
    return {
      system: systemPrompt,
      messages: claudeMessages
    };
  }

  /**
   * Parse Claude's streaming response chunks
   */
  private parseClaudeStreamChunk(line: string): { content?: string; isDone?: boolean } {
    if (!line.startsWith('data: ')) {
      return {};
    }

    const data = line.slice(6);
    if (data === '[DONE]') {
      return { isDone: true };
    }

    try {
      const json = JSON.parse(data);
      
      // Handle different Claude streaming event types
      switch (json.type) {
        case 'content_block_delta':
          return {
            content: json.delta?.text,
            isDone: false
          };
        case 'message_stop':
          return { isDone: true };
        default:
          return {};
      }
    } catch {
      return {}; // Skip invalid JSON lines
    }
  }
  
  async *generateStream(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): AsyncIterableIterator<StreamChunk> {
    const { system, messages: claudeMessages } = this.convertMessages(messages, systemPrompt);
    
    const requestBody: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      stream: boolean;
      system?: string;
      tools?: Record<string, unknown>[];
    } = {
      model: this.model,
      max_tokens: 8192,
      messages: claudeMessages,
      stream: true
    };
    
    if (system) {
      requestBody.system = system;
    }
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody),
      mode: 'cors'
    });
    
    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          const parseResult = this.parseClaudeStreamChunk(trimmedLine);
          
          if (parseResult.isDone) {
            yield { type: 'done', content: '' };
            return;
          }
          
          if (parseResult.content) {
            yield {
              type: 'text',
              content: parseResult.content
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  
}