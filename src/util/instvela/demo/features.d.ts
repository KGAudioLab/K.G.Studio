import type { InstVelaConstants, InstVelaNote, InstVelaScore } from '../types';

export interface InstVelaFeatures {
  continuous: Float32Array;
  categorical: Uint8Array;
  n_frames: number;
  reference_pitch: Float32Array;
  use_velocity: boolean;
  notes: InstVelaNote[];
}

export function computeFeatures(score: InstVelaScore, options: {
  frameRate: number;
  tailSeconds: number;
  minCroppedNoteSeconds: number;
  timeCapSeconds: number;
}): InstVelaFeatures;
export function standardize(continuous: Float32Array, stats: InstVelaConstants['score_feature_stats']): Float32Array;
