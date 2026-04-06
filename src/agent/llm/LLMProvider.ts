import OpenAI from 'openai';
import type { StreamChunk } from './StreamingTypes';
import type { Message, ToolCall } from '../core/AgentState';
import type { OpenAIToolDefinition } from '../tools/BaseTool';

/**
 * LLM provider using the OpenAI SDK.
 * Works with any OpenAI-compatible API (OpenAI, OpenRouter, Ollama, vLLM, etc.)
 */
export class LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseURL?: string) {
    // The OpenAI SDK appends /chat/completions itself, so strip it if the user included it
    const normalizedBaseURL = baseURL?.replace(/\/chat\/completions\/?$/, '') || undefined;

    this.client = new OpenAI({
      apiKey,
      ...(normalizedBaseURL ? { baseURL: normalizedBaseURL } : {}),
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  /**
   * Convert internal Message[] to OpenAI ChatCompletionMessageParam[]
   */
  private convertMessages(
    messages: Message[],
    systemPrompt?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content ?? '' });
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content ?? null,
        };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          assistantMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
        }
        result.push(assistantMsg);
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id!,
          content: msg.content ?? '',
        });
      }
    }

    return result;
  }

  /**
   * Generate a streaming response from the LLM.
   * Yields StreamChunks for text content and tool calls.
   */
  async *generateStream(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): AsyncIterableIterator<StreamChunk> {
    const openaiMessages = this.convertMessages(messages, systemPrompt);

    const requestParams: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: openaiMessages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      requestParams.tools = tools as unknown as OpenAI.ChatCompletionTool[];
      requestParams.tool_choice = 'auto';
    }

    const stream = this.client.chat.completions.stream(requestParams);

    // Accumulate tool calls across chunks (they arrive incrementally)
    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      console.log('LLMProvider: chunk', JSON.stringify(chunk));
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Yield text content
      if (delta.content) {
        yield { type: 'text', content: delta.content };
      }

      // Accumulate tool calls from deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index);
          if (existing) {
            // Append to existing tool call
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            // New tool call
            toolCallAccumulator.set(tc.index, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            });
          }
        }
      }
    }

    // After stream ends, get the final completion for finish_reason
    const finalCompletion = await stream.finalChatCompletion();
    const finishReason = finalCompletion.choices[0]?.finish_reason ?? 'stop';

    // Emit accumulated tool calls
    if (toolCallAccumulator.size > 0) {
      for (const [, tc] of toolCallAccumulator) {
        const toolCall: ToolCall = {
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        };
        yield { type: 'tool_call', content: '', toolCall };
      }
    }

    // Signal completion
    yield { type: 'done', content: '', finishReason };
  }
}
