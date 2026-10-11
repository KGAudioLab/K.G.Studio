import { afterEach, expect, it, vi } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { getCompressorVisualConfig } from './compressorVisualConfig';
afterEach(() => vi.restoreAllMocks());
it('validates compressor display settings independently of the limiter', () => {
  const get = vi.spyOn(ConfigManager.instance(), 'get').mockReturnValue(undefined);
  expect(getCompressorVisualConfig()).toEqual({ fps: 10, historySeconds: 8, minDb: -100, maxDb: 0, reductionRangeDb: 30 });
  get.mockImplementation(key => key === 'audio.fx_visual.compressor.reduction_range_db' ? 0
    : key === 'audio.fx_visual.compressor.fps' ? 20 : undefined);
  expect(getCompressorVisualConfig()).toMatchObject({ fps: 20, reductionRangeDb: 1 });
});
