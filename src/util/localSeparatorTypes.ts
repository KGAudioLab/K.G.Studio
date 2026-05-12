export type StereoChannels = [Float32Array, Float32Array];

export interface LocalSeparatorModelDefaults {
  sampleRate: number;
  hopLength: number;
  segmentSize: number;
  overlap: number;
  batchSize: number;
  enableDenoise: boolean;
  invertUsingSpec: boolean;
  normalizationThreshold: number;
  amplificationThreshold: number;
  matchMixOverlap: number;
}

export interface LocalSeparatorModelMetadata {
  compensate: number;
  mdx_dim_f_set: number;
  mdx_dim_t_set: number;
  mdx_n_fft_scale_set: number;
  primary_stem: string;
}

export interface LocalSeparatorModelConfig {
  filename: string;
  displayName: string;
  status: 'ready';
  defaults: LocalSeparatorModelDefaults;
  metadata: LocalSeparatorModelMetadata;
}

export interface LocalSeparatorProgress {
  stage: string;
  passLabel: string;
  percent: number;
  processedChunks: number;
  totalChunks: number;
}

export interface LocalRuntimeSupport {
  webgpuExposed: boolean;
}

export type LocalRuntimeProvider = 'webgpu' | 'wasm';

export interface LocalRuntimeState {
  provider: LocalRuntimeProvider;
  session: import('onnxruntime-web/webgpu').InferenceSession;
}
