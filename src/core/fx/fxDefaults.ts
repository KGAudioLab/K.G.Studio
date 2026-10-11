import bundledDefaults from 'virtual:fx-defaults';
import { ConfigManager } from '../config/ConfigManager';
import { bounded } from './fxValidation';
import type { KGEQBand } from './KGEQFX';
import type { ReverbType } from './KGReverbFX';
import type { KGCompressorFXParameters } from './KGCompressorFX';
import type { KGLimiterFXParameters } from './KGLimiterFX';

export interface FXDefaults {
  enabled: boolean;
  eq: { bands: [KGEQBand, KGEQBand, KGEQBand] };
  reverb: { reverbType: ReverbType; wet: number };
  compressor: KGCompressorFXParameters;
  limiter: KGLimiterFXParameters;
}

const fallback = bundledDefaults;
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Read factory defaults lazily: config loads after model modules are imported.
 * The bundled copy of the same JSON supports startup, tests, and fetch failures.
 * Use the factory config, not persisted user settings, so a new config.json
 * changes future defaults without changing any existing project FX values.
 */
export function getFXDefaults(): FXDefaults {
  const loaded = ConfigManager.instance()?.getDefaults?.()?.audio?.fx_defaults;
  const config = object(loaded);
  const eq = object(config.eq);
  const bands = Array.isArray(eq.bands) ? eq.bands : [];
  const defaults = fallback.eq.bands.map((band, index) => {
    const value = object(bands[index]);
    return {
      frequencyHz: bounded(value.frequencyHz, band.frequencyHz, 20, 20000),
      q: bounded(value.q, band.q, 0.1, 10),
      gainDb: bounded(value.gainDb, band.gainDb, -18, 18),
    };
  }) as FXDefaults['eq']['bands'];
  // Maintain the three identities even when a configured frequency is unordered.
  for (let i = 2; i >= 0; i--) defaults[i].frequencyHz = Math.max(20 + i,
    Math.min(defaults[i].frequencyHz, i === 2 ? 20000 : defaults[i + 1].frequencyHz - 1));
  const reverb = object(config.reverb);
  const type = ['hall', 'room', 'chamber', 'plate', 'spring'].includes(reverb.reverbType as string)
    ? reverb.reverbType as ReverbType : fallback.reverb.reverbType;
  const compressor = object(config.compressor);
  const limiter = object(config.limiter);
  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : fallback.enabled,
    eq: { bands: defaults },
    reverb: { reverbType: type, wet: bounded(reverb.wet, fallback.reverb.wet, 0, 1) },
    compressor: {
      thresholdDb: bounded(compressor.thresholdDb, fallback.compressor.thresholdDb, -100, 0),
      ratio: bounded(compressor.ratio, fallback.compressor.ratio, 1, 20),
      attackMs: bounded(compressor.attackMs, fallback.compressor.attackMs, 0, 1000),
      releaseMs: bounded(compressor.releaseMs, fallback.compressor.releaseMs, 0, 1000),
      gainDb: bounded(compressor.gainDb, fallback.compressor.gainDb, -24, 24),
    },
    limiter: {
      inputGainDb: bounded(limiter.inputGainDb, fallback.limiter.inputGainDb, -24, 24),
      thresholdDb: bounded(limiter.thresholdDb, fallback.limiter.thresholdDb, -100, 0),
    },
  };
}
