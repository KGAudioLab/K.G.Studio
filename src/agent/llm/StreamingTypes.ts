/**
 * Types for streaming LLM responses
 */

import type { ToolCall } from '../core/AgentState';

export interface PerformanceInfo {
  prefillTps?: number;
  generationTps?: number;
}

export type ToolApprovalDecision = 'allow' | 'always_allow' | 'deny';

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  content: string;
  toolCall?: ToolCall;
  toolResult?: {
    toolCallId?: string;
    name: string;
    success: boolean;
    result: string;
    denied?: boolean;
  };
  performanceInfo?: PerformanceInfo;
  finishReason?: string;
}
