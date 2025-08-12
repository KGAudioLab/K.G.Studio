import type { StreamChunk, LLMResponse } from './StreamingTypes';
import type { Message } from '../core/AgentState';

/**
 * Abstract interface for LLM providers
 */
export abstract class LLMProvider {
  abstract name: string;
  
  /**
   * Generate a streaming response from the LLM
   * @param messages The full conversation history with preserved roles
   * @param systemPrompt The system prompt (optional, can be included in messages)
   * @param tools Available tools (optional for now)
   */
  abstract generateStream(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): AsyncIterableIterator<StreamChunk>;
  
  /**
   * Generate a complete response from the LLM (non-streaming)
   * @param messages The full conversation history with preserved roles
   * @param systemPrompt The system prompt (optional, can be included in messages)
   * @param tools Available tools (optional for now)
   */
  abstract generateCompletion(
    messages: Message[], 
    systemPrompt?: string,
    tools?: Record<string, unknown>[]
  ): Promise<LLMResponse>;
}