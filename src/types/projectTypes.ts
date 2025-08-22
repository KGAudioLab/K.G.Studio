import { Transform, type TransformFnParams } from 'class-transformer';

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
