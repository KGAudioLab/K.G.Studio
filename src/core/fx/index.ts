import { KGFX, type FXType } from './KGFX';
import { KGEQFX } from './KGEQFX';
import { KGReverbFX } from './KGReverbFX';
import { KGCompressorFX } from './KGCompressorFX';
import { KGLimiterFX } from './KGLimiterFX';
export { KGFX, KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX };
export type { FXType };

export function createFX(type: FXType): KGFX {
  switch (type) {
    case 'eq': return new KGEQFX();
    case 'reverb': return new KGReverbFX();
    case 'compressor': return new KGCompressorFX();
    case 'limiter': return new KGLimiterFX();
  }
}

/** Reject unsupported types rather than silently losing saved effects. */
export function normalizeFXList(value: unknown): KGFX[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('Invalid track FX list');
  const ids = new Set<number>();
  return value.map(effect => {
    if (!(effect instanceof KGEQFX || effect instanceof KGReverbFX || effect instanceof KGCompressorFX || effect instanceof KGLimiterFX)) {
      throw new Error('Unsupported FX type');
    }
    const normalized = effect.clone(ids.has(effect.getId()));
    ids.add(normalized.getId());
    return normalized;
  });
}
