import { describe, expect, it } from 'vitest';
import { getModelTokenLimits } from './modelTokenLimits';

describe('modelTokenLimits', () => {
  it('returns OpenAI limits for supported GPT models', () => {
    expect(getModelTokenLimits('gpt-5.2')).toEqual({
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
    });

    expect(getModelTokenLimits('gpt-4o')).toEqual({
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
    });
  });

  it('returns Claude limits for supported direct and OpenRouter aliases', () => {
    expect(getModelTokenLimits('claude-sonnet-4.6')).toEqual({
      contextWindow: 200_000,
      reservedOutputTokens: 8_192,
    });

    expect(getModelTokenLimits('anthropic/claude-opus-4.6')).toEqual({
      contextWindow: 200_000,
      reservedOutputTokens: 8_192,
    });
  });

  it('matches snapshot-style suffixes by prefix', () => {
    expect(getModelTokenLimits('gpt-5.2-2025-12-11')).toEqual({
      contextWindow: 400_000,
      maxOutputTokens: 128_000,
    });

    expect(getModelTokenLimits('anthropic/claude-sonnet-4.6-20260101')).toEqual({
      contextWindow: 200_000,
      reservedOutputTokens: 8_192,
    });
  });

  it('returns Gemini limits for supported Gemini models', () => {
    expect(getModelTokenLimits('gemini-2.5-flash')).toEqual({
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
    });
  });

  it('returns undefined for unknown models', () => {
    expect(getModelTokenLimits('custom-company-model')).toBeUndefined();
  });
});
