/**
 * Types for streaming LLM responses
 */

import type { ToolCall } from '../core/AgentState';

export interface PerformanceInfo {
  prefillTps?: number;
  generationTps?: number;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content: string;
  toolCall?: ToolCall;
  toolResult?: { name: string; success: boolean; result: string };
  performanceInfo?: PerformanceInfo;
  finishReason?: string;
}
