import { Transform, type TransformFnParams } from 'class-transformer';
import type { PerformanceInfo, ToolApprovalDecision } from '../agent/llm/StreamingTypes';
import type { TodoItem } from '../agent/core/todo';

export interface TimeSignature {
    numerator: number;
    denominator: number;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    tokenCount?: number;
    performanceInfo?: PerformanceInfo;
    toolName?: string;
    toolSuccess?: boolean;
    toolRawResult?: string;
    toolResultDisplayContent?: string;
    toolConfirmation?: {
        toolCallId: string;
        toolName: string;
        message: string;
    };
    toolDenied?: boolean;
    onToolConfirmationDecision?: (decision: ToolApprovalDecision) => void;
    todoSnapshot?: TodoItem[];
    isToolCallMessage?: boolean;
}

/**
 * A reusable class-transformer decorator to apply a default value during deserialization.
 * @param defaultValue The default value to apply if the field is undefined.
 */
export function WithDefault<T>(defaultValue: T) {
    return Transform(({ value }: TransformFnParams) => value ?? defaultValue, {
        toClassOnly: true,
    });
}
