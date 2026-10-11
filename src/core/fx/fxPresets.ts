import { instanceToPlain } from 'class-transformer';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX, type KGFX } from './index';
import { REVERB_TYPES } from './KGReverbFX';
import { isValidProjectName } from '../../util/projectNameUtil';

export interface FXPresetData { version: 1; effects: Record<string, unknown>[] }
export function isValidFXPresetName(name: string): boolean {
  return isValidProjectName(name) && name.trim().toLowerCase() !== 'default';
}
export function serializeFXPreset(effects: readonly KGFX[]): FXPresetData {
  return { version: 1, effects: effects.map(effect => {
    const data = instanceToPlain(effect) as Record<string, unknown>;
    delete data.id;
    return data;
  }) };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid FX preset');
  return value as Record<string, unknown>;
}
function number(data: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid FX preset parameter');
  return value;
}
/** Validate before constructing models; malformed files must never silently reset parameters. */
export function deserializeFXPreset(value: unknown): KGFX[] {
  const data = object(value);
  if (data.version !== 1 || !Array.isArray(data.effects)) throw new Error('Unsupported FX preset format');
  return data.effects.map(value => {
    const node = object(value);
    if (typeof node.enabled !== 'boolean') throw new Error('Invalid FX preset state');
    let effect: KGFX;
    switch (node.__type) {
      case 'KGEQFX': {
        if (!Array.isArray(node.bands) || node.bands.length !== 3) throw new Error('Invalid EQ bands');
        const bands = node.bands.map(value => {
          const band = object(value);
          return { frequencyHz: number(band, 'frequencyHz', 20, 20000), q: number(band, 'q', .1, 10), gainDb: number(band, 'gainDb', -18, 18) };
        });
        if (bands.some((band, index) => index > 0 && band.frequencyHz < bands[index - 1].frequencyHz + 1)) throw new Error('Invalid EQ band order');
        effect = new KGEQFX(bands); break;
      }
      case 'KGReverbFX': {
        if (!REVERB_TYPES.includes(node.reverbType as typeof REVERB_TYPES[number])) throw new Error('Invalid reverb type');
        effect = new KGReverbFX(node.reverbType as typeof REVERB_TYPES[number], number(node, 'wet', 0, 1)); break;
      }
      case 'KGCompressorFX': effect = new KGCompressorFX({ thresholdDb: number(node, 'thresholdDb', -100, 0), ratio: number(node, 'ratio', 1, 20),
        attackMs: number(node, 'attackMs', 0, 1000), releaseMs: number(node, 'releaseMs', 0, 1000), gainDb: number(node, 'gainDb', -24, 24) }); break;
      case 'KGLimiterFX': effect = new KGLimiterFX({ inputGainDb: number(node, 'inputGainDb', -24, 24), thresholdDb: number(node, 'thresholdDb', -100, 0) }); break;
      default: throw new Error('Unsupported FX preset node');
    }
    effect.setEnabled(node.enabled);
    return effect;
  });
}
