import type { EqPreviewState } from './EqCard';
import type { ReverbPreviewState } from './ReverbCard';
import type { CompressorPreviewState } from './CompressorCard';
import type { LimiterPreviewState } from './LimiterCard';
import { createPreviewBands } from './eqPreview';

export type FxType = 'eq' | 'reverb' | 'compressor' | 'limiter';
export type FxInstance =
  | { id: string; type: 'eq'; state: EqPreviewState }
  | { id: string; type: 'reverb'; state: ReverbPreviewState }
  | { id: string; type: 'compressor'; state: CompressorPreviewState }
  | { id: string; type: 'limiter'; state: LimiterPreviewState };

export function createFxInstance(type: FxType): FxInstance {
  const id = crypto.randomUUID();
  switch (type) {
    case 'eq': return { id, type, state: { enabled: true, expanded: true, selectedBand: 1, bands: createPreviewBands() } };
    case 'reverb': return { id, type, state: { enabled: true, expanded: true, type: 'hall', mix: 0.1 } };
    case 'compressor': return { id, type, state: { enabled: true, expanded: true, threshold: -24, ratio: 4, attack: 10, release: 228, gain: 0 } };
    case 'limiter': return { id, type, state: { enabled: true, expanded: true, inputGain: 0, threshold: -4.1 } };
  }
}
