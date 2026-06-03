import { Transform, type TransformFnParams } from 'class-transformer';
import type { PerformanceInfo } from '../agent/llm/StreamingTypes';
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
    todoSnapshot?: TodoItem[];
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
