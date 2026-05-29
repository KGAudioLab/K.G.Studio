import type { LocalSeparatorModelConfig, LocalSeparatorModelId } from './types';

export const LOCAL_SEPARATOR_MODEL_IDS = {
  mdxMedium: 'UVR-MDX-NET-Inst_HQ_3.onnx',
  htdemucs4s: 'htdemucs_4s.onnx',
} as const satisfies Record<string, LocalSeparatorModelId>;

export const LOCAL_SEPARATOR_DEFAULT_MODEL_ID = LOCAL_SEPARATOR_MODEL_IDS.mdxMedium;

export const LOCAL_SEPARATOR_MODEL_CONFIGS: Record<LocalSeparatorModelId, LocalSeparatorModelConfig> = {
  [LOCAL_SEPARATOR_MODEL_IDS.mdxMedium]: {
    id: LOCAL_SEPARATOR_MODEL_IDS.mdxMedium,
    filename: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    kind: 'mdx',
    displayName: 'Vocal and Instrument (Medium Accuracy)',
    status: 'ready',
    outputStemNames: ['Instrumental', 'Vocals'],
    defaultChunkDurationSeconds: null,
    defaults: {
      sampleRate: 44100,
      hopLength: 1024,
      segmentSize: 256,
      overlap: 0.25,
      batchSize: 1,
      enableDenoise: false,
      invertUsingSpec: false,
      normalizationThreshold: 0.9,
      amplificationThreshold: 0,
      matchMixOverlap: 0.02,
    },
    metadata: {
      compensate: 1.021,
      mdx_dim_f_set: 3072,
      mdx_dim_t_set: 8,
      mdx_n_fft_scale_set: 7680,
      primary_stem: 'Instrumental',
    },
    download: {
      configKey: 'general.uvr5_web_runtime.mdx_net_model_url',
      defaultUrl: 'https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx',
      expectedSizeBytes: 66759214,
    },
  },
  [LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s]: {
    id: LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s,
    filename: 'htdemucs_4s.onnx',
    kind: 'demucs',
    displayName: 'Vocal, Drums, Bass, and Others',
    status: 'ready',
    outputStemNames: ['Vocals', 'Drums', 'Bass', 'Others'],
    defaultChunkDurationSeconds: 8,
    defaults: {
      sampleRate: 44100,
      hopLength: 1024,
      segmentSize: 256,
      overlap: 0.25,
      batchSize: 1,
      enableDenoise: false,
      invertUsingSpec: false,
      normalizationThreshold: 0.9,
      amplificationThreshold: 0,
      matchMixOverlap: 0.02,
    },
    metadata: null,
    download: {
      configKey: 'general.uvr5_web_runtime.htdemucs_4s_model_url',
      defaultUrl: 'https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx',
      expectedSizeBytes: 180534758,
    },
  },
};

export const LOCAL_SEPARATOR_MODELS = Object.values(LOCAL_SEPARATOR_MODEL_CONFIGS);

export function getLocalSeparatorModelConfig(modelId: string): LocalSeparatorModelConfig {
  const config = LOCAL_SEPARATOR_MODEL_CONFIGS[modelId as LocalSeparatorModelId];
  if (!config) {
    return LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_DEFAULT_MODEL_ID];
  }
  return config;
}
