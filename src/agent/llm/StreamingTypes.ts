/**
 * Types for streaming LLM responses
 */

import type { ToolCall } from '../core/AgentState';

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content: string;
  toolCall?: ToolCall;
  toolResult?: { name: string; success: boolean; result: string };
  finishReason?: string; // 'stop' | 'tool_calls' — present on 'done' chunks
}
