import { describe, expect, it, vi } from 'vitest';
import { ConversationCompactor } from './ConversationCompactor';
import type { LLMProvider } from '../llm/LLMProvider';
import type { Message } from '../core/AgentState';

function createStubProvider(summaryPrefix = 'summary'): LLMProvider {
  return {
    async *generateStream(messages) {
      const source = messages[0]?.content ?? '';
      yield { type: 'text', content: `${summaryPrefix}:${String(source).slice(0, 12)}` };
      yield { type: 'done', content: '', finishReason: 'stop' };
    },
  };
}

describe('ConversationCompactor', () => {
  it('preserves the recent raw tail while compacting the prefix', async () => {
    const compactor = new ConversationCompactor({
      provider: createStubProvider(),
      systemPrompt: 'compact prompt',
    });
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'older user', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'older reply', timestamp: 2 },
      { id: '3', role: 'user', content: 'recent user', timestamp: 3 },
      { id: '4', role: 'assistant', content: 'recent reply', timestamp: 4 },
    ];

    const result = await compactor.compact(messages, 2);

    expect(result.changed).toBe(true);
    expect(result.summary).toContain('Compacted conversation summary:');
    expect(result.compactedConversation).toContain('recent user');
    expect(result.compactedConversation).toContain('recent reply');
  });

  it('returns unchanged when there is no compactable prefix', async () => {
    const compactor = new ConversationCompactor({
      provider: createStubProvider(),
      systemPrompt: 'compact prompt',
    });
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'only user', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'only reply', timestamp: 2 },
    ];

    const result = await compactor.compact(messages, 0);

    expect(result.changed).toBe(false);
  });

  it('emits progress while generating chunk summaries', async () => {
    const onProgress = vi.fn();
    const compactor = new ConversationCompactor({
      provider: createStubProvider(),
      systemPrompt: 'compact prompt',
      onProgress,
    });
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'older user', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'older reply', timestamp: 2 },
      { id: '3', role: 'user', content: 'recent user', timestamp: 3 },
      { id: '4', role: 'assistant', content: 'recent reply', timestamp: 4 },
    ];

    await compactor.compact(messages, 2);

    expect(onProgress).toHaveBeenCalled();
  });

  it('prepends supplemental todo context to the summarization prompt', async () => {
    const prompts: string[] = [];
    const provider: LLMProvider = {
      async *generateStream(messages) {
        prompts.push(String(messages[0]?.content ?? ''));
        yield { type: 'text', content: 'summary' };
        yield { type: 'done', content: '', finishReason: 'stop' };
      },
    };
    const compactor = new ConversationCompactor({
      provider,
      systemPrompt: 'compact prompt',
      supplementalContext: 'Current todo state:\n[>] #1: Review melody',
    });
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'older user', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'older reply', timestamp: 2 },
      { id: '3', role: 'user', content: 'recent user', timestamp: 3 },
      { id: '4', role: 'assistant', content: 'recent reply', timestamp: 4 },
    ];

    await compactor.compact(messages, 2);

    expect(prompts[0]).toContain('Current todo state:');
    expect(prompts[0]).toContain('[>] #1: Review melody');
  });
});
