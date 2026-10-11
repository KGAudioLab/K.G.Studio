import { KGFX, KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX, type FXType } from '../../core/fx';
import type { EqPreviewState } from './EqCard';
import type { ReverbPreviewState } from './ReverbCard';
import type { CompressorPreviewState } from './CompressorCard';
import type { LimiterPreviewState } from './LimiterCard';

export type FxType = FXType;
export interface FXViewState { expanded: boolean; selectedBand: number }
export type FxInstance =
  | { id: string; type: 'eq'; state: EqPreviewState }
  | { id: string; type: 'reverb'; state: ReverbPreviewState }
  | { id: string; type: 'compressor'; state: CompressorPreviewState }
  | { id: string; type: 'limiter'; state: LimiterPreviewState };

/** Adapt the core's explicit units to the existing card controls. */
export function toFxPreview(effect: KGFX, view?: FXViewState): FxInstance {
  const common = { enabled: effect.getEnabled(), expanded: view?.expanded ?? true };
  const id = effect.getId();
  if (effect instanceof KGEQFX) return { id, type: 'eq', state: { ...common, selectedBand: view?.selectedBand ?? 1,
    bands: effect.getBands().map(band => ({ frequency: band.frequencyHz, q: band.q, gain: band.gainDb })) } };
  if (effect instanceof KGReverbFX) return { id, type: 'reverb', state: { ...common, type: effect.getReverbType(), mix: effect.getWet() } };
  if (effect instanceof KGCompressorFX) {
    const p = effect.getParameters();
    return { id, type: 'compressor', state: { ...common, threshold: p.thresholdDb, ratio: p.ratio,
      attack: p.attackMs, release: p.releaseMs, gain: p.gainDb } };
  }
  if (effect instanceof KGLimiterFX) {
    const p = effect.getParameters();
    return { id, type: 'limiter', state: { ...common, inputGain: p.inputGainDb, threshold: p.thresholdDb } };
  }
  throw new Error('Unsupported FX type');
}

export function fromFxPreview(instance: FxInstance): KGFX {
  let effect: KGFX;
  switch (instance.type) {
    case 'eq': effect = new KGEQFX(instance.state.bands.map(band => ({ frequencyHz: band.frequency, q: band.q, gainDb: band.gain })), instance.id); break;
    case 'reverb': effect = new KGReverbFX(instance.state.type, instance.state.mix, instance.id); break;
    case 'compressor': effect = new KGCompressorFX({ thresholdDb: instance.state.threshold, ratio: instance.state.ratio,
      attackMs: instance.state.attack, releaseMs: instance.state.release, gainDb: instance.state.gain }, instance.id); break;
    case 'limiter': effect = new KGLimiterFX({ inputGainDb: instance.state.inputGain, thresholdDb: instance.state.threshold }, instance.id); break;
  }
  effect.setEnabled(instance.state.enabled);
  return effect;
}
