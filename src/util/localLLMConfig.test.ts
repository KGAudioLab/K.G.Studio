import { describe, expect, it } from 'vitest';
import {
  formatLocalLLMContextLength,
  LOCAL_LLM_DEFAULT_CONTEXT_LENGTH,
  normalizeLocalLLMContextLength,
} from './localLLMConfig';

describe('localLLMConfig', () => {
  it('defaults invalid context lengths to 32768', () => {
    expect(normalizeLocalLLMContextLength(undefined)).toBe(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
    expect(normalizeLocalLLMContextLength(12345)).toBe(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
  });

  it('formats context lengths using k suffixes', () => {
    expect(formatLocalLLMContextLength(32768)).toBe('32k');
    expect(formatLocalLLMContextLength(65536)).toBe('64k');
    expect(formatLocalLLMContextLength(131072)).toBe('128k');
  });
});
