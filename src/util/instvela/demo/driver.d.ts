import type * as ort from 'onnxruntime-web/webgpu';
import type { InstVelaConstants, InstVelaProgress } from '../types';
import type { InstVelaFeatures } from './features';
import type { seededNoise } from './prng';

export type InstVelaGraph = 'f0_cond' | 'f0_step' | 'ac_cond' | 'ac_step' | 'vocoder';
export function synthesize(options: {
  ort: typeof ort;
  run: (graph: InstVelaGraph, feeds: Record<string, ort.Tensor>) => Promise<Float32Array[]>;
  C: InstVelaConstants;
  feats: InstVelaFeatures;
  x: Float32Array;
  noise: ReturnType<typeof seededNoise>;
  s: {
    stepsF0: number;
    stepsAc: number;
    cfgF0: number;
    cfgAc: number;
    pitchExpression: number;
    transpose: number;
    windowSeconds: number;
    knownPrefixSeconds: number;
    vocoderChunkSeconds: number;
    vocoderContextSeconds: number;
  };
  onProgress: (progress: InstVelaProgress) => void;
}): Promise<{ wave: Float32Array }>;

export function removeDc(wave: Float32Array): Float32Array<ArrayBuffer>;
