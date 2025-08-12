import { LLMProvider } from './LLMProvider';
import type { StreamChunk, LLMResponse } from './StreamingTypes';
import type { Message } from '../core/AgentState';
import { ConfigManager } from '../../core/config/ConfigManager';

/**
 * Google Gemini API provider implementation
 */
export class GeminiProvider extends LLMProvider {
  readonly name = 'Gemini';
  
  private apiKey: string;
  private model: string;
  private baseURL: string = 'https://generativelanguage.googleapis.com';
  private apiEndpoint: string;
  
  constructor() {
    super();
    
    const configManager = ConfigManager.instance();
    this.apiKey = configManager.get('general.gemini.api_key') as string;
    this.model = configManager.get('general.gemini.model') as string;
    this.apiEndpoint = `${this.baseURL}/v1beta/models/${this.model}`;
  }

  /**
   * Convert internal messages to Gemini's format
   */
  private convertMessages(messages: Message[], systemPrompt?: string): {
    systemInstruction?: { parts: Array<{ text: string }> };
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  } {
    const geminiMessages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    
    for (const msg of messages) {
      let role: 'user' | 'model';
      
      if (msg.role === 'assistant') {
        role = 'model';
      } else {
        // Treat system and user messages as 'user' role
        role = 'user';
      }
      
      geminiMessages.push({
        role,
        parts: [{ text: msg.content }]
      });
    }
    
    const result: {
      systemInstruction?: { parts: Array<{ text: string }> };
      contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
    } = {
      contents: geminiMessages
    };
    
    if (systemPrompt) {
      result.systemInstruction = {
        parts: [{ text: systemPrompt }]
      };
    }
    
    return result;
  }

  /**
   * Parse Gemini's streaming response chunks
   */
  private parseGeminiStreamChunk(chunk: string): { content?: string; isDone?: boolean } {
    try {
      const json = JSON.parse(chunk.trim());
      
      // Gemini streaming format
      if (json.candidates && json.candidates.length > 0) {
        const candidate = json.candidates[0];
        
        // Check if generation is finished
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          return { isDone: true };
        }
        
        // Extract text content
        const content = candidate.content?.parts?.[0]?.text;
        if (content) {
          return { content, isDone: false };
        }
      }
      
      // Check for explicit done signal
      if (json.done === true) {
        return { isDone: true };
      }
      
      return {};
    } catch {
      return {}; // Skip invalid JSON
    }
  }
  
  async *generateStream(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): AsyncIterableIterator<StreamChunk> {
    const { systemInstruction, contents } = this.convertMessages(messages, systemPrompt);
    
    const requestBody: {
      contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number; maxOutputTokens: number };
      systemInstruction?: { parts: Array<{ text: string }> };
      tools?: Record<string, unknown>[];
    } = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    };
    
    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.apiEndpoint}:streamGenerateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
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
        
        // Gemini sends JSON objects separated by newlines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          const parseResult = this.parseGeminiStreamChunk(trimmedLine);
          
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
  
  async generateCompletion(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): Promise<LLMResponse> {
    const { systemInstruction, contents } = this.convertMessages(messages, systemPrompt);
    
    const requestBody: {
      contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number; maxOutputTokens: number };
      systemInstruction?: { parts: Array<{ text: string }> };
      tools?: Record<string, unknown>[];
    } = {
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    };
    
    if (systemInstruction) {
      requestBody.systemInstruction = systemInstruction;
    }
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.apiEndpoint}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Extract content from Gemini's response format
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';
    
    // Extract tool calls if present (Gemini format)
    const toolCalls = candidate?.content?.parts
      ?.filter((part: { functionCall?: unknown }) => part.functionCall)
      ?.map((part: { functionCall: { name: string; args: Record<string, unknown> } }) => ({
        id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, // Generate ID
        name: part.functionCall.name,
        parameters: part.functionCall.args
      })) || [];
    
    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finished: candidate?.finishReason === 'STOP' || candidate?.finishReason === 'MAX_TOKENS'
    };
  }
}