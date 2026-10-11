import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigManager } from './ConfigManager';
import { getEQVisualConfig } from './eqVisualConfig';

afterEach(() => vi.restoreAllMocks());
describe('EQ visual settings', () => {
  it('defaults missing settings and rejects unsupported FFT sizes', () => {
    const get = vi.spyOn(ConfigManager.instance(), 'get').mockReturnValue(undefined);
    expect(getEQVisualConfig()).toEqual({ fps: 10, fftSize: 2048 });
    get.mockImplementation(key => key.endsWith('fps') ? 120 : 3000);
    expect(getEQVisualConfig()).toEqual({ fps: 60, fftSize: 2048 });
  });
  it('reads runtime values so future settings changes take effect', () => {
    vi.spyOn(ConfigManager.instance(), 'get').mockImplementation(key => key.endsWith('fps') ? 15 : 4096);
    expect(getEQVisualConfig()).toEqual({ fps: 15, fftSize: 4096 });
  });
});
