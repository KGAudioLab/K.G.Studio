import { afterEach, expect, it, vi } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { getLimiterVisualConfig } from './limiterVisualConfig';
afterEach(() => vi.restoreAllMocks());
it('defaults missing settings and bounds runtime overrides', () => {
  const get = vi.spyOn(ConfigManager.instance(), 'get').mockReturnValue(undefined);
  expect(getLimiterVisualConfig()).toEqual({ fps: 10, historySeconds: 8, minDb: -100, maxDb: 0 });
  get.mockImplementation(key => ({ fps: 100, history_seconds: 1000, min_db: 12, max_db: -Infinity })[key.split('.').pop()!] ?? undefined);
  expect(getLimiterVisualConfig()).toEqual({ fps: 60, historySeconds: 30, minDb: -1, maxDb: 0 });
});
