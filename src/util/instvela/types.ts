import type modelFiles from './modelFiles.json';

export type InstVelaBundle = keyof typeof modelFiles;
export type InstVelaVoice = 'string_violin' | 'string_viola' | 'string_cello' | 'string_double_bass';
export type InstVelaArticulation = 'sustain' | 'spiccato' | 'pizzicato';
export type InstVelaProvider = 'webgpu' | 'wasm';
export type InstVelaStage = 'models' | 'features' | 'F0 generator' | 'acoustic generator' | 'vocoder' | 'done';
export interface InstVelaProgress {
  stage: InstVelaStage;
  percent: number | null;
  completed: number;
  total: number;
}
export interface InstVelaNote {
  pitch: number;
  start: number;
  end: number;
  velocity: number;
  articulation: InstVelaArticulation;
}
export interface InstVelaScore {
  tempo_bpm: number;
  time_signature: [number, number];
  bar_origin_beats: 0;
  controls: { instrument: InstVelaVoice };
  notes: InstVelaNote[];
}
export interface InstVelaRequest {
  bundle: InstVelaBundle;
  score: InstVelaScore;
  region: {
    id: string;
    name: string;
    trackId: number;
    trackName: string;
    startTick: number;
    lengthTicks: number;
  };
}
export interface InstVelaAudio {
  wave: Float32Array<ArrayBuffer>;
  sampleRate: number;
}
export type InstVelaWorkerMessage =
  | { type: 'progress'; progress: InstVelaProgress }
  | { type: 'provider'; provider: InstVelaProvider | null }
  | { type: 'result'; audio: InstVelaAudio }
  | { type: 'error'; message: string };

export interface InstVelaConstants {
  frame_rate: number;
  sample_rate: number;
  latent_dim: number;
  latent_mean: number[];
  latent_std: number[];
  residual_std: number;
  pad_multiple: { f0_step: number; ac_step: number };
  hop: number;
  source_harmonics: number;
  score_feature_stats: { standardized: Record<string, { mean: number; std: number }> };
  selftest_tolerance: Record<string, number>;
}
