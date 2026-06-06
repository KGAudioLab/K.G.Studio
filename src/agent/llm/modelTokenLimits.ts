export interface ModelTokenLimits {
  contextWindow: number;
  maxOutputTokens?: number;
  reservedOutputTokens?: number;
}

const MODEL_TOKEN_LIMITS: Record<string, ModelTokenLimits> = {
  // OpenAI official model pages / compare docs
  'gpt-5.2': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5-mini': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5-nano': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-4o': { contextWindow: 128_000, maxOutputTokens: 16_384 },

  // GPT-5.4 family is present in current OpenAI docs, but exact limit pages were not surfaced.
  // Use GPT-5 family limits as a best-effort alias until exact per-model docs are available.
  'gpt-5.4': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5.4-mini': { contextWindow: 400_000, maxOutputTokens: 128_000 },
  'gpt-5.4-nano': { contextWindow: 400_000, maxOutputTokens: 128_000 },

  // Claude official docs: 200k standard context window across these families.
  // Anthropic docs do not expose a simple per-model max output token table for these aliases,
  // so we keep a conservative preflight reserve instead of claiming an exact output maximum.
  'claude-sonnet-4.6': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'claude-opus-4.6': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'claude-sonnet-4.5': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'claude-opus-4.5': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'claude-sonnet-4': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'claude-opus-4.1': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-sonnet-4.6': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-opus-4.6': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-sonnet-4.5': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-opus-4.5': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-sonnet-4': { contextWindow: 200_000, reservedOutputTokens: 8_192 },
  'anthropic/claude-opus-4.1': { contextWindow: 200_000, reservedOutputTokens: 8_192 },

  // Gemini official model docs
  'gemini-2.5-flash': { contextWindow: 1_048_576, maxOutputTokens: 65_536 },
};

export function getModelTokenLimits(model: string): ModelTokenLimits | undefined {
  const exact = MODEL_TOKEN_LIMITS[model];
  if (exact) {
    return exact;
  }

  const prefix = Object.keys(MODEL_TOKEN_LIMITS).find(key => model.startsWith(`${key}-`));
  return prefix ? MODEL_TOKEN_LIMITS[prefix] : undefined;
}
