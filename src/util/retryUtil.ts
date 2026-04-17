import { KGONE_CONSTANTS } from '../constants/coreConstants';

export interface RetryConfig {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Wraps fetch() with exponential-backoff retry on non-200 responses or
 * network errors. AbortErrors propagate immediately — no retry.
 *
 * Use only for idempotent calls (polling, downloads).
 * Do NOT use for load-model or job-submission calls.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = {}
): Promise<Response> {
  const {
    maxAttempts      = KGONE_CONSTANTS.MAX_RETRY_ATTEMPTS,
    initialDelayMs   = KGONE_CONSTANTS.RETRY_INITIAL_DELAY_MS,
    backoffMultiplier = KGONE_CONSTANTS.RETRY_BACKOFF_MULTIPLIER,
  } = config;

  const signal = options.signal as AbortSignal | undefined;
  let delay = initialDelayMs;
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.ok) return resp;

      const body = await resp.text().catch(() => '');
      lastError = new Error(`HTTP ${resp.status}${body ? `: ${body}` : ''}`);
    } catch (err) {
      // Propagate abort immediately — user cancelled, do not retry
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxAttempts - 1) {
      // Abort-aware sleep before the next attempt
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, delay);
        signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
      });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      delay *= backoffMultiplier;
    }
  }

  throw lastError;
}
