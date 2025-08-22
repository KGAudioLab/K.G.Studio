/**
 * Constants related to LLM providers and API interactions
 */

// Protocol markers and special character combinations used in LLM communications
export const LLM_PROTOCOL = {
  SSE_DATA_PREFIX: 'data: ',
  SSE_DONE_MARKER: '[DONE]',
  SEGMENT_SEPARATOR: '\n\n'
} as const;