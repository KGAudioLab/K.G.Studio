import { describe, expect, it } from 'vitest';
import { getSystemPromptPathForAgentMode, normalizeAgentMode } from './agentMode';

describe('agentMode', () => {
  it.each(['regular', 'advanced', 'efficient'] as const)('preserves %s as a valid mode', (mode) => {
    expect(normalizeAgentMode(mode)).toBe(mode);
  });

  it.each([undefined, null, '', 'unknown', 1])('defaults invalid mode %s to advanced', (value) => {
    expect(normalizeAgentMode(value)).toBe('advanced');
  });

  it('resolves a separate prompt for each mode', () => {
    expect(getSystemPromptPathForAgentMode('regular')).toBe('prompts/system.md');
    expect(getSystemPromptPathForAgentMode('advanced')).toBe('prompts/system_advanced.md');
    expect(getSystemPromptPathForAgentMode('efficient')).toBe('prompts/system_compact.md');
  });
});
