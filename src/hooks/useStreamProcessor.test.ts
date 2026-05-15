import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    id: `${role}-message`,
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
});
