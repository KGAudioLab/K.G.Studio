import { describe, expect, it } from 'vitest';
import { AgentState } from './AgentState';

describe('AgentState compaction helpers', () => {
  it('preserves the most recent exchange block as the raw tail', () => {
    const state = new AgentState('conv_test');
    state.addMessage('user', 'first');
    state.addMessage('assistant', 'first reply');
    state.addMessage('user', 'second');
    state.addMessage('assistant', 'second reply');

    expect(state.findRecentTailStartIndex()).toBe(2);
  });

  it('creates compacted history with a synthetic summary message', () => {
    const state = new AgentState('conv_test');
    state.addMessage('user', 'first');
    state.addMessage('assistant', 'first reply');
    state.addMessage('user', 'second');
    state.addMessage('assistant', 'second reply');

    const compacted = state.createCompactedHistory('summary', 2, 'manual');

    expect(compacted).toHaveLength(3);
    expect(compacted[0]).toMatchObject({
      role: 'assistant',
      content: 'summary',
      is_compacted_summary: true,
      compact_trigger: 'manual',
    });
    expect(compacted[1].content).toBe('second');
    expect(compacted[2].content).toBe('second reply');
  });

  it('retains full history after current history is compacted', () => {
    const state = new AgentState('conv_test');
    state.addMessage('user', 'first');
    state.addMessage('assistant', 'first reply');
    state.addMessage('user', 'second');
    state.addMessage('assistant', 'second reply');

    const compacted = state.createCompactedHistory('summary', 2, 'manual');
    state.replaceMessages(compacted);

    expect(state.getMessages()).toHaveLength(3);
    expect(state.getFullMessages()).toHaveLength(4);
    expect(state.getFullMessages().map(message => message.content)).toEqual([
      'first',
      'first reply',
      'second',
      'second reply',
    ]);
  });

  it('clears full history when conversation is cleared', () => {
    const state = new AgentState('conv_test');
    state.addMessage('user', 'first');
    state.addMessage('assistant', 'reply');

    state.clearMessages();

    expect(state.getMessages()).toHaveLength(0);
    expect(state.getFullMessages()).toHaveLength(0);
  });
});
