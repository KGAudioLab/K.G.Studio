import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TodoItem } from '../agent/core/todo';

vi.mock('../agent/core/AgentCore', () => ({
  AgentCore: {
    instance: vi.fn()
  }
}));

vi.mock('../utils/chatMessageUtils', () => ({
  createStreamingMessage: () => ({
    id: 'streaming-message',
    role: 'assistant',
    content: '<span class="processing-wave">Thinking...</span> click here to abort.',
    isStreaming: true,
    tokenCount: 0
  }),
  createMessage: (role: 'user' | 'assistant', content: string) => ({
    id: `${role}-${content}`,
    role,
    content
  })
}));

import { AgentCore } from '../agent/core/AgentCore';
import { useStreamProcessor } from './useStreamProcessor';
import type { ChatMessage } from '../types/projectTypes';

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useStreamProcessor', () => {
  it('switches from Thinking to Processing after the first text token arrives', async () => {
    let releaseDone!: () => void;
    const doneGate = new Promise<void>((resolve) => {
      releaseDone = resolve;
    });

    vi.spyOn(AgentCore, 'instance').mockReturnValue({
      processUserInput: async function* () {
        yield { type: 'text', content: 'Hello' };
        await doneGate;
        yield { type: 'done', content: '' };
      }
    } as unknown as AgentCore);

    const messages = new Map<string, ChatMessage>();
    const processingChanges: boolean[] = [];

    const { result } = renderHook(() => useStreamProcessor({
      onMessageAdd: (message) => {
        messages.set(message.id, message);
      },
      onMessageUpdate: (messageId, updater) => {
        const current = messages.get(messageId);
        if (!current) {
          throw new Error(`Missing message ${messageId}`);
        }
        messages.set(messageId, updater(current));
      },
      onMessageRemove: (messageId) => {
        messages.delete(messageId);
      },
      onProcessingChange: (isProcessing) => {
        processingChanges.push(isProcessing);
      }
    }));

    let responsePromise!: Promise<string>;
    await act(async () => {
      responsePromise = result.current.processStream('test prompt');
      await flushMicrotasks();
    });

    const streamingMessage = [...messages.values()][0];
    expect(streamingMessage).toBeDefined();
    expect(streamingMessage.content).toContain('<span class="processing-wave">Processing...</span>');
    expect(streamingMessage.content).toContain('1 tokens received.');
    expect(streamingMessage.content).toContain('click here to abort.');
    expect(streamingMessage.tokenCount).toBe(1);
    expect(processingChanges).toContain(true);

    await act(async () => {
      releaseDone();
      await responsePromise;
    });

    expect(processingChanges.at(-1)).toBe(false);
  });

  it('suppresses update_todo_list tool-call messages and emits structured todo snapshots', async () => {
    const todoSnapshot: TodoItem[] = [
      { id: '1', text: 'Inspect melody', status: 'completed', updatedAt: 1 },
      { id: '2', text: 'Write harmony', status: 'in_progress', activeText: 'Writing harmony', updatedAt: 2 },
    ];

    vi.spyOn(AgentCore, 'instance').mockReturnValue({
      getAgentState: () => ({
        getTodos: () => todoSnapshot,
      }),
      processUserInput: async function* () {
        yield {
          type: 'tool_call',
          content: '',
          toolCall: {
            id: 'todo-call-1',
            type: 'function',
            function: {
              name: 'update_todo_list',
              arguments: JSON.stringify({ items: [] }),
            },
          },
        };
        yield {
          type: 'tool_result',
          content: '',
          toolResult: {
            name: 'update_todo_list',
            success: true,
            result: 'todo fallback content',
          },
        };
        yield { type: 'done', content: '' };
      },
    } as unknown as AgentCore);

    const messages = new Map<string, ChatMessage>();

    const { result } = renderHook(() => useStreamProcessor({
      onMessageAdd: (message) => {
        messages.set(message.id, message);
      },
      onMessageUpdate: (messageId, updater) => {
        const current = messages.get(messageId);
        if (!current) {
          throw new Error(`Missing message ${messageId}`);
        }
        messages.set(messageId, updater(current));
      },
      onMessageRemove: (messageId) => {
        messages.delete(messageId);
      },
      onProcessingChange: () => undefined,
    }));

    await act(async () => {
      await result.current.processStream('todo prompt');
    });

    const addedMessages = [...messages.values()];
    expect(addedMessages.some(message => message.content.includes('Calling tool: update_todo_list'))).toBe(false);
    expect(addedMessages.some(message => message.toolName === 'update_todo_list')).toBe(true);
    const todoMessage = addedMessages.find(message => message.toolName === 'update_todo_list');
    expect(todoMessage?.toolSuccess).toBe(true);
    expect(todoMessage?.todoSnapshot).toEqual(todoSnapshot);
    expect(todoMessage?.content).toBe('todo fallback content');
  });

  it('continues to show generic tool-call messages for non-todo tools', async () => {
    vi.spyOn(AgentCore, 'instance').mockReturnValue({
      getAgentState: () => ({
        getTodos: () => [],
      }),
      processUserInput: async function* () {
        yield {
          type: 'tool_call',
          content: '',
          toolCall: {
            id: 'read-call-1',
            type: 'function',
            function: {
              name: 'read_music',
              arguments: JSON.stringify({}),
            },
          },
        };
        yield {
          type: 'tool_result',
          content: '',
          toolResult: {
            name: 'read_music',
            success: true,
            result: 'music data',
          },
        };
        yield { type: 'done', content: '' };
      },
    } as unknown as AgentCore);

    const messages = new Map<string, ChatMessage>();

    const { result } = renderHook(() => useStreamProcessor({
      onMessageAdd: (message) => {
        messages.set(message.id, message);
      },
      onMessageUpdate: (messageId, updater) => {
        const current = messages.get(messageId);
        if (!current) {
          throw new Error(`Missing message ${messageId}`);
        }
        messages.set(messageId, updater(current));
      },
      onMessageRemove: (messageId) => {
        messages.delete(messageId);
      },
      onProcessingChange: () => undefined,
    }));

    await act(async () => {
      await result.current.processStream('read prompt');
    });

    const addedMessages = [...messages.values()];
    expect(addedMessages.some(message => message.content.includes('Calling tool: read_music'))).toBe(true);
    expect(addedMessages.some(message => message.toolName === 'update_todo_list')).toBe(false);
  });
});
