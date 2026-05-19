import type { LocalSeparatorModelConfig } from './localSeparatorTypes';

export const LOCAL_SEPARATOR_DEFAULT_MODEL_URL =
  'https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx';

export const LOCAL_SEPARATOR_MODEL_FILENAME = 'UVR-MDX-NET-Inst_HQ_3.onnx';
export const LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES = 66759214;

export const LOCAL_SEPARATOR_MODEL_CONFIG: LocalSeparatorModelConfig = {
  filename: LOCAL_SEPARATOR_MODEL_FILENAME,
  displayName: 'Vocal and Instrument (Medium Accuracy)',
  status: 'ready',
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
};
