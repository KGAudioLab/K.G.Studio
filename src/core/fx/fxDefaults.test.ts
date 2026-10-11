import { afterEach, describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import config from '../../../public/config.json';
import { ConfigManager } from '../config/ConfigManager';
import { getFXDefaults, type FXDefaults } from './fxDefaults';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from './index';

function factory(defaults: unknown) {
  return { audio: { fx_defaults: defaults } } as ReturnType<ConfigManager['getDefaults']>;
}
afterEach(() => vi.restoreAllMocks());

describe('FX factory defaults from config.json', () => {
  it('uses the JSON before config loads and resolves later config for new models and transforms', () => {
    const getDefaults = vi.spyOn(ConfigManager.instance(), 'getDefaults').mockReturnValue(null);
    expect(getFXDefaults()).toEqual(config.audio.fx_defaults);
    const old = new KGReverbFX('spring', .8);
    const defaults: FXDefaults = {
      enabled: false,
      eq: { bands: [
        { frequencyHz: 80, q: 1, gainDb: -3 }, { frequencyHz: 800, q: 2, gainDb: 2 }, { frequencyHz: 8000, q: 3, gainDb: 4 },
      ] },
      reverb: { reverbType: 'room', wet: .6 },
      compressor: { thresholdDb: -30, ratio: 8, attackMs: 15, releaseMs: 250, gainDb: 3 },
      limiter: { thresholdDb: -2, inputGainDb: 4 },
    };
    getDefaults.mockReturnValue(factory(defaults));
    expect(new KGEQFX().getBands()).toEqual(defaults.eq.bands);
    expect(new KGCompressorFX().getParameters()).toEqual(defaults.compressor);
    expect(new KGLimiterFX().getParameters()).toEqual(defaults.limiter);
    expect(new KGReverbFX().getReverbType()).toBe('room');
    expect(new KGReverbFX().getWet()).toBe(.6);
    expect(new KGEQFX().getEnabled()).toBe(false);
    expect(plainToInstance(KGCompressorFX, { attackMs: NaN, releaseMs: Infinity }).getParameters()).toEqual(defaults.compressor);
    const restored = plainToInstance(KGReverbFX, { reverbType: 'spring', wet: .8, enabled: true });
    expect(restored.getWet()).toBe(.8); expect(restored.getReverbType()).toBe('spring'); expect(restored.getEnabled()).toBe(true);
    expect(old.getReverbType()).toBe('spring'); expect(old.getWet()).toBe(.8); expect(old.getEnabled()).toBe(true);
    const bands = getFXDefaults().eq.bands; bands[0].gainDb = 18;
    expect(getFXDefaults().eq.bands[0].gainDb).toBe(-3);
  });

  it('falls back for missing or invalid config fields and enforces valid ranges and band order', () => {
    vi.spyOn(ConfigManager.instance(), 'getDefaults').mockReturnValue(factory({
      enabled: 'false', eq: { bands: [{ frequencyHz: 50000, q: Infinity }, { frequencyHz: 1 }, { frequencyHz: 1 }] },
      reverb: { reverbType: 'unknown', wet: 5 }, compressor: { releaseMs: NaN, ratio: 100 }, limiter: { thresholdDb: 10 },
    }));
    const defaults = getFXDefaults();
    expect(defaults.enabled).toBe(true); expect(defaults.eq.bands.map(band => band.frequencyHz)).toEqual([20, 21, 22]);
    expect(defaults.eq.bands[0].q).toBe(.7);
    expect(defaults.reverb).toEqual({ reverbType: 'chamber', wet: 1 });
    expect(defaults.compressor.ratio).toBe(20); expect(defaults.compressor.releaseMs).toBe(100);
    expect(defaults.limiter.thresholdDb).toBe(0);
  });
});
