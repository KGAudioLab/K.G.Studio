export type StereoChannels = [Float32Array, Float32Array];

export type LocalSeparatorModelId = 'UVR-MDX-NET-Inst_HQ_3.onnx' | 'htdemucs_4s.onnx';
export type LocalSeparatorModelKind = 'mdx' | 'demucs';

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

export interface LocalSeparatorMdxMetadata {
  compensate: number;
  mdx_dim_f_set: number;
  mdx_dim_t_set: number;
  mdx_n_fft_scale_set: number;
  primary_stem: string;
}

export interface LocalSeparatorModelDownloadConfig {
  configKey: 'general.uvr5_web_runtime.mdx_net_model_url' | 'general.uvr5_web_runtime.htdemucs_4s_model_url';
  defaultUrl: string;
  expectedSizeBytes: number;
}

interface LocalSeparatorModelConfigBase {
  id: LocalSeparatorModelId;
  filename: string;
  kind: LocalSeparatorModelKind;
  displayName: string;
  status: 'ready';
  outputStemNames: string[];
  defaultChunkDurationSeconds: number | null;
  defaults: LocalSeparatorModelDefaults;
  download: LocalSeparatorModelDownloadConfig;
}

export interface LocalSeparatorMdxModelConfig extends LocalSeparatorModelConfigBase {
  kind: 'mdx';
  metadata: LocalSeparatorMdxMetadata;
}

export interface LocalSeparatorDemucsModelConfig extends LocalSeparatorModelConfigBase {
  kind: 'demucs';
  metadata: null;
}

export type LocalSeparatorModelConfig = LocalSeparatorMdxModelConfig | LocalSeparatorDemucsModelConfig;

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
