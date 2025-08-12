/**
 * Types for streaming LLM responses and tool execution
 */

import type { ToolResult } from '../tools/BaseTool';

// Re-export for convenience
export type { ToolResult };

export interface ToolInvocation {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content: string;
  toolCall?: ToolInvocation;
  toolResult?: ToolResult;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolInvocation[];
  finished: boolean;
}