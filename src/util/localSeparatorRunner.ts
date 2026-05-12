import * as ort from 'onnxruntime-web/webgpu';
import { LocalSeparatorCpuDsp } from './localSeparatorCpuDsp';
import { LocalSeparatorGpuDsp } from './localSeparatorGpuDsp';
import { LocalSeparatorTimingCollector } from './localSeparatorTiming';
import type {
  LocalRuntimeProvider,
  LocalSeparatorModelConfig,
  LocalSeparatorProgress,
  StereoChannels,
} from './localSeparatorTypes';
import {
  concatFloat32,
  createWindowCache,
  getHanning,
  negateArray,
  normalizeChannels,
  scaleChannels,
  sliceChannels,
} from './localSeparatorShared';

const SAMPLE_RATE = 44100;

function localSeparatorLog(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.log(`[localSeparator] ${message}`);
    return;
  }
  console.log(`[localSeparator] ${message}`, payload);
}

interface BrowserMdxSeparatorOptions {
  overlap?: number;
  runtimeBatchSize?: number;
  timing?: LocalSeparatorTimingCollector;
  onProgress?: (progress: LocalSeparatorProgress) => void;
  onProviderChange?: (provider: string) => void;
}

interface SpectrogramPayload {
  data: Float32Array;
  dims: number[];
  frames?: number;
}

function packBatchPayloads(payloads: SpectrogramPayload[]): { data: Float32Array; dims: number[]; itemSize: number } {
  const frames = payloads[0].dims[3];
  const dimF = payloads[0].dims[2];
  const batch = payloads.length;
  const itemSize = 4 * dimF * frames;
  const data = new Float32Array(batch * itemSize);

  payloads.forEach((payload, index) => {
    data.set(payload.data, index * itemSize);
  });

  return {
    data,
    dims: [batch, 4, dimF, frames],
    itemSize,
  };
}

function unpackBatchOutput(outputData: Float32Array, batchInfo: { dims: number[]; itemSize: number }): SpectrogramPayload[] {
  const results: SpectrogramPayload[] = [];
  for (let index = 0; index < batchInfo.dims[0]; index += 1) {
    const start = index * batchInfo.itemSize;
    const end = start + batchInfo.itemSize;
    results.push({
      data: outputData.slice(start, end),
      dims: [1, 4, batchInfo.dims[2], batchInfo.dims[3]],
    });
  }
  return results;
}

class BrowserMdxSeparator {
  private readonly session: ort.InferenceSession;
  private readonly runtimeProvider: LocalRuntimeProvider;
  private readonly defaults: LocalSeparatorModelConfig['defaults'];
  private readonly metadata: LocalSeparatorModelConfig['metadata'];
  public onProgress: (progress: LocalSeparatorProgress) => void;
  private overlap: number;
  private runtimeBatchSize: number;
  private readonly enableDenoise: boolean;
  private readonly compensate: number;
  private readonly primaryStem: string;
  private readonly secondaryStem: string;
  private readonly nFft: number;
  private readonly hopLength: number;
  private readonly chunkSize: number;
  private readonly trim: number;
  private readonly windowCache = createWindowCache();
  private readonly timing: LocalSeparatorTimingCollector;
  private dsp: LocalSeparatorCpuDsp | LocalSeparatorGpuDsp;
  private dspMode: 'cpu' | 'gpu-hybrid';

  public static async create(
    session: ort.InferenceSession,
    runtimeProvider: LocalRuntimeProvider,
    config: LocalSeparatorModelConfig,
    options: BrowserMdxSeparatorOptions = {},
  ): Promise<BrowserMdxSeparator> {
    const timing = options.timing ?? new LocalSeparatorTimingCollector('mdx-separation');
    let dsp: LocalSeparatorCpuDsp | LocalSeparatorGpuDsp | null = null;
    let dspMode: 'cpu' | 'gpu-hybrid' = 'cpu';

    if (runtimeProvider === 'webgpu') {
      try {
        dsp = await timing.measureAsync('dspInit', () => LocalSeparatorGpuDsp.create(config));
        dspMode = 'gpu-hybrid';
        localSeparatorLog('GPU DSP initialized successfully.');
      } catch (error) {
        console.warn('[localSeparator] GPU DSP initialization failed, using CPU DSP.', error);
        options.onProviderChange?.('webgpu + cpu dsp fallback');
        localSeparatorLog(
          'GPU DSP initialization failed. Inference session may still use WebGPU, but DSP will fall back to CPU.',
          error,
        );
      }
    }

    if (!dsp) {
      dsp = new LocalSeparatorCpuDsp(config);
      if (runtimeProvider === 'webgpu') {
        localSeparatorLog('Using CPU DSP while keeping the WebGPU inference provider.');
      } else {
        localSeparatorLog('Using CPU DSP because the active inference provider is CPU/wasm.');
      }
    }

    return new BrowserMdxSeparator(session, runtimeProvider, config, {
      ...options,
      dsp,
      dspMode,
      timing,
    });
  }

  private constructor(
    session: ort.InferenceSession,
    runtimeProvider: LocalRuntimeProvider,
    config: LocalSeparatorModelConfig,
    options: BrowserMdxSeparatorOptions & {
      dsp: LocalSeparatorCpuDsp | LocalSeparatorGpuDsp;
      dspMode: 'cpu' | 'gpu-hybrid';
      timing: LocalSeparatorTimingCollector;
    },
  ) {
    this.session = session;
    this.runtimeProvider = runtimeProvider;
    this.defaults = config.defaults;
    this.metadata = config.metadata;
    this.onProgress = options.onProgress ?? (() => {});
    this.overlap = options.overlap ?? this.defaults.overlap;
    this.runtimeBatchSize = Math.max(1, options.runtimeBatchSize ?? 2);
    this.enableDenoise = this.defaults.enableDenoise;
    this.compensate = this.metadata.compensate;
    this.primaryStem = this.metadata.primary_stem ?? 'Vocals';
    this.secondaryStem = this.primaryStem === 'Instrumental' ? 'Vocals' : 'Instrumental';
    this.nFft = this.metadata.mdx_n_fft_scale_set;
    this.hopLength = this.defaults.hopLength;
    this.trim = Math.floor(this.nFft / 2);
    this.chunkSize = this.hopLength * (this.defaults.segmentSize - 1);
    this.dsp = options.dsp;
    this.dspMode = options.dspMode;
    this.timing = options.timing;
  }

  public dispose(): void {
    this.dsp.dispose();
  }

  public getDebugSummary(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return this.timing.getSummary({
      runtimeProvider: this.runtimeProvider,
      dspMode: this.dspMode,
      ...extra,
    });
  }

  public async separate(channels: StereoChannels): Promise<{
    stems: Record<string, StereoChannels>;
    primaryStem: string;
    secondaryStem: string;
  }> {
    this.onProgress({ stage: 'main', passLabel: 'Main pass', percent: 0, processedChunks: 0, totalChunks: 0 });

    const { channels: normalizedChannels, originalPeak } = this.timing.measureSync(
      'normalize',
      () => normalizeChannels(channels, this.defaults.normalizationThreshold, this.defaults.amplificationThreshold),
    );
    const primarySource = await this.demix(normalizedChannels, false);
    this.onProgress({
      stage: 'main-complete',
      passLabel: 'Main pass',
      percent: this.defaults.invertUsingSpec ? 50 : 100,
      processedChunks: 0,
      totalChunks: 0,
    });

    const primaryScaled = this.timing.measureSync('scalePrimary', () => scaleChannels(primarySource, originalPeak));

    let secondaryChannels: StereoChannels;
    if (this.defaults.invertUsingSpec) {
      const rawMix = await this.demix(normalizedChannels, true);
      secondaryChannels = this.timing.measureSync('secondaryFromMix', () => {
        const secondaryLeft = new Float32Array(rawMix[0].length);
        const secondaryRight = new Float32Array(rawMix[1].length);

        for (let i = 0; i < secondaryLeft.length; i += 1) {
          secondaryLeft[i] = rawMix[0][i] - (primaryScaled[0][i] * this.compensate);
          secondaryRight[i] = rawMix[1][i] - (primaryScaled[1][i] * this.compensate);
        }

        return [secondaryLeft, secondaryRight];
      });
    } else {
      secondaryChannels = this.timing.measureSync('secondarySubtract', () => {
        const secondaryLeft = new Float32Array(primaryScaled[0].length);
        const secondaryRight = new Float32Array(primaryScaled[1].length);
        for (let i = 0; i < secondaryLeft.length; i += 1) {
          secondaryLeft[i] = normalizedChannels[0][i] - (primaryScaled[0][i] * this.compensate);
          secondaryRight[i] = normalizedChannels[1][i] - (primaryScaled[1][i] * this.compensate);
        }
        return [secondaryLeft, secondaryRight];
      });
    }

    const primaryNormalized = this.timing.measureSync(
      'normalizePrimaryOutput',
      () => normalizeChannels(primaryScaled, this.defaults.normalizationThreshold, this.defaults.amplificationThreshold).channels,
    );
    const secondaryNormalized = this.timing.measureSync(
      'normalizeSecondaryOutput',
      () => normalizeChannels(secondaryChannels, this.defaults.normalizationThreshold, this.defaults.amplificationThreshold).channels,
    );

    return {
      stems: {
        [this.primaryStem]: primaryNormalized,
        [this.secondaryStem]: secondaryNormalized,
      },
      primaryStem: this.primaryStem,
      secondaryStem: this.secondaryStem,
    };
  }

  private async demix(channels: StereoChannels, isMatchMix: boolean): Promise<StereoChannels> {
    const overlap = isMatchMix ? this.defaults.matchMixOverlap : this.overlap;
    const genSize = this.chunkSize - (2 * this.trim);
    const pad = genSize + this.trim - (channels[0].length % genSize);
    const mixture: StereoChannels = [
      concatFloat32([new Float32Array(this.trim), channels[0], new Float32Array(pad)]),
      concatFloat32([new Float32Array(this.trim), channels[1], new Float32Array(pad)]),
    ];

    const step = Math.max(1, Math.trunc((1 - overlap) * this.chunkSize));
    const result: StereoChannels = [new Float32Array(mixture[0].length), new Float32Array(mixture[1].length)];
    const divider: StereoChannels = [new Float32Array(mixture[0].length), new Float32Array(mixture[1].length)];
    const totalChunks = Math.ceil(mixture[0].length / step);
    let processedChunks = 0;

    const windows: Array<{
      start: number;
      actualSize: number;
      leftChunk: Float32Array;
      rightChunk: Float32Array;
      window: Float32Array | null;
    }> = [];

    for (let start = 0; start < mixture[0].length; start += step) {
      const end = Math.min(start + this.chunkSize, mixture[0].length);
      const actualSize = end - start;
      const leftChunk = new Float32Array(this.chunkSize);
      const rightChunk = new Float32Array(this.chunkSize);
      leftChunk.set(mixture[0].subarray(start, end));
      rightChunk.set(mixture[1].subarray(start, end));
      windows.push({
        start,
        actualSize,
        leftChunk,
        rightChunk,
        window: overlap !== 0 ? getHanning(actualSize, this.windowCache) : null,
      });
    }

    for (let batchStart = 0; batchStart < windows.length; batchStart += this.runtimeBatchSize) {
      const batch = windows.slice(batchStart, batchStart + this.runtimeBatchSize);
      const tarWavesBatch = await this.processBatch(batch, isMatchMix);

      batch.forEach((chunk, index) => {
        const tarWaves = tarWavesBatch[index];
        for (let i = 0; i < chunk.actualSize; i += 1) {
          const weight = chunk.window ? chunk.window[i] : 1;
          result[0][chunk.start + i] += tarWaves[0][i] * weight;
          result[1][chunk.start + i] += tarWaves[1][i] * weight;
          divider[0][chunk.start + i] += weight;
          divider[1][chunk.start + i] += weight;
        }

        processedChunks += 1;
        const passFraction = totalChunks > 0 ? processedChunks / totalChunks : 1;
        const overallPercent = isMatchMix ? 50 + (passFraction * 50) : passFraction * (this.defaults.invertUsingSpec ? 50 : 100);
        this.onProgress({
          stage: isMatchMix ? 'match-mix' : 'main',
          passLabel: isMatchMix ? 'Match-mix pass' : 'Main pass',
          percent: overallPercent,
          processedChunks,
          totalChunks,
        });
      });
    }

    const left = new Float32Array(channels[0].length);
    const right = new Float32Array(channels[1].length);
    const endTrim = result[0].length - this.trim;
    for (let i = this.trim; i < endTrim; i += 1) {
      const outIndex = i - this.trim;
      if (outIndex >= left.length) break;
      left[outIndex] = divider[0][i] > 1e-8 ? result[0][i] / divider[0][i] : 0;
      right[outIndex] = divider[1][i] > 1e-8 ? result[1][i] / divider[1][i] : 0;
    }

    return [left, right];
  }

  private async processBatch(
    batch: Array<{ leftChunk: Float32Array; rightChunk: Float32Array }>,
    isMatchMix: boolean,
  ): Promise<StereoChannels[]> {
    const spectra = await this.timing.measureAsync(
      isMatchMix ? 'matchMixDspForward' : 'dspForward',
      () => Promise.all(batch.map(chunk => this.dsp.forwardStereo(chunk.leftChunk, chunk.rightChunk))),
    );

    if (isMatchMix) {
      return this.timing.measureAsync(
        'matchMixDspInverse',
        () => Promise.all(spectra.map(payload => this.dsp.inverseStereo(payload))),
      );
    }

    let predictedPayloads;
    if (this.enableDenoise) {
      const positiveOutput = await this.executeModelBatch(spectra);
      const negativePayloads = spectra.map(payload => ({
        data: negateArray(payload.data),
        dims: payload.dims,
      }));
      const negativeOutput = await this.executeModelBatch(negativePayloads);
      predictedPayloads = positiveOutput.map((payload, index) => {
        const data = new Float32Array(payload.data.length);
        for (let i = 0; i < data.length; i += 1) {
          data[i] = (negativeOutput[index].data[i] * -0.5) + (payload.data[i] * 0.5);
        }
        return { data, dims: payload.dims };
      });
    } else {
      predictedPayloads = await this.executeModelBatch(spectra);
    }

    return this.timing.measureAsync(
      'dspInverse',
      () => Promise.all(predictedPayloads.map(payload => this.dsp.inverseStereo(payload))),
    );
  }

  private async executeModelBatch(payloads: SpectrogramPayload[]): Promise<SpectrogramPayload[]> {
    const packed = packBatchPayloads(payloads);
    const tensor = new ort.Tensor('float32', packed.data, packed.dims);
    const feeds = { [this.session.inputNames[0]]: tensor };
    try {
        const outputs = await this.timing.measureAsync('inference', () => this.session.run(feeds));
        const firstOutputName = this.session.outputNames[0];
        return unpackBatchOutput(outputs[firstOutputName].data as Float32Array, packed);
      } catch (error) {
        if (payloads.length > 1 && this.runtimeBatchSize > 1) {
        console.warn('[localSeparator] Batched inference failed, falling back to batch size 1.', error);
        localSeparatorLog('Batched inference failed. Falling back to batch size 1.', error);
        this.runtimeBatchSize = 1;
        const singleResults: SpectrogramPayload[] = [];
        for (const payload of payloads) {
          const singlePacked = packBatchPayloads([payload]);
          const singleTensor = new ort.Tensor('float32', singlePacked.data, singlePacked.dims);
          const singleFeeds = { [this.session.inputNames[0]]: singleTensor };
          const outputs = await this.timing.measureAsync('inferenceFallback', () => this.session.run(singleFeeds));
          const firstOutputName = this.session.outputNames[0];
          singleResults.push(...unpackBatchOutput(outputs[firstOutputName].data as Float32Array, singlePacked));
        }
        return singleResults;
      }
      throw error;
    }
  }
}

export async function decodeAudioToStereo(arrayBuffer: ArrayBuffer): Promise<StereoChannels> {
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  let buffer = decoded;

  if (decoded.sampleRate !== SAMPLE_RATE) {
    const offline = new OfflineAudioContext({
      numberOfChannels: Math.max(2, decoded.numberOfChannels),
      length: Math.ceil(decoded.duration * SAMPLE_RATE),
      sampleRate: SAMPLE_RATE,
    });
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    buffer = await offline.startRendering();
  }

  await audioContext.close();

  if (buffer.numberOfChannels === 1) {
    const mono = buffer.getChannelData(0);
    return [new Float32Array(mono), new Float32Array(mono)];
  }

  return [new Float32Array(buffer.getChannelData(0)), new Float32Array(buffer.getChannelData(1))];
}

export function channelsToWavBlob(channels: StereoChannels, sampleRate: number = SAMPLE_RATE): Blob {
  const length = channels[0].length;
  const interleaved = new Int16Array(length * 2);
  for (let i = 0; i < length; i += 1) {
    interleaved[i * 2] = toInt16(channels[0][i]);
    interleaved[(i * 2) + 1] = toInt16(channels[1][i]);
  }

  const buffer = new ArrayBuffer(44 + (interleaved.length * 2));
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + (interleaved.length * 2), true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, interleaved.length * 2, true);

  let offset = 44;
  for (let i = 0; i < interleaved.length; i += 1) {
    view.setInt16(offset, interleaved[i], true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function toInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

function concatChannelPairs(chunks: StereoChannels[]): StereoChannels {
  return [concatFloat32(chunks.map(chunk => chunk[0])), concatFloat32(chunks.map(chunk => chunk[1]))];
}

export async function runLocalSeparator(options: {
  session: ort.InferenceSession;
  runtimeProvider: LocalRuntimeProvider;
  modelConfig: LocalSeparatorModelConfig;
  audioBuffer: ArrayBuffer;
  chunkDurationSeconds: number | null;
  overlap: number;
  onProgress: (progress: LocalSeparatorProgress) => void;
  onProviderChange?: (provider: string) => void;
}): Promise<{
  stems: Array<{ name: string; blob: Blob }>;
  providerLabel: string;
  debugSummary: Record<string, unknown>;
}> {
  const timing = new LocalSeparatorTimingCollector('local-separation');
  const decoded = await timing.measureAsync('decode', () => decodeAudioToStereo(options.audioBuffer));
  localSeparatorLog(`Running browser MDX separation on ${options.runtimeProvider === 'webgpu' ? 'GPU/WebGPU' : 'CPU/wasm'}...`);

  const separator = await BrowserMdxSeparator.create(
    options.session,
    options.runtimeProvider,
    options.modelConfig,
    {
      overlap: options.overlap,
      runtimeBatchSize: options.modelConfig.defaults.batchSize > 1 ? options.modelConfig.defaults.batchSize : 2,
      timing,
      onProgress: options.onProgress,
      onProviderChange: options.onProviderChange,
    },
  );

  try {
    const outputs = await separateWithOptionalChunking(
      separator,
      decoded,
      timing,
      options.chunkDurationSeconds,
      options.modelConfig,
      options.onProgress,
    );
    const primaryBlob = timing.measureSync('wavEncodePrimary', () => channelsToWavBlob(outputs.stems[outputs.primaryStem]));
    const secondaryBlob = timing.measureSync('wavEncodeSecondary', () => channelsToWavBlob(outputs.stems[outputs.secondaryStem]));

    return {
      stems: [
        { name: outputs.primaryStem, blob: primaryBlob },
        { name: outputs.secondaryStem, blob: secondaryBlob },
      ],
      providerLabel: options.runtimeProvider === 'webgpu' ? 'GPU/WebGPU' : 'CPU/wasm',
      debugSummary: separator.getDebugSummary({ model: options.modelConfig.filename }),
    };
  } finally {
    localSeparatorLog('Separation timing summary', separator.getDebugSummary({ model: options.modelConfig.filename }));
    separator.dispose();
  }
}

async function separateWithOptionalChunking(
  separator: BrowserMdxSeparator,
  decoded: StereoChannels,
  timing: LocalSeparatorTimingCollector,
  chunkDurationSeconds: number | null,
  modelConfig: LocalSeparatorModelConfig,
  onProgress: (progress: LocalSeparatorProgress) => void,
): Promise<{
  stems: Record<string, StereoChannels>;
  primaryStem: string;
  secondaryStem: string;
}> {
  if (!chunkDurationSeconds) {
    return separator.separate(decoded);
  }

  const chunkSamples = Math.max(1, Math.floor(chunkDurationSeconds * SAMPLE_RATE));
  if (decoded[0].length <= chunkSamples) {
    return separator.separate(decoded);
  }

  const totalChunks = Math.ceil(decoded[0].length / chunkSamples);
  const primaryStem = modelConfig.metadata.primary_stem ?? 'Vocals';
  const secondaryStem = primaryStem === 'Instrumental' ? 'Vocals' : 'Instrumental';
  const primaryStemChunks: StereoChannels[] = [];
  const secondaryStemChunks: StereoChannels[] = [];
  const baseOnProgress = separator.onProgress;

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSamples;
    const end = Math.min(start + chunkSamples, decoded[0].length);
    const chunk = sliceChannels(decoded, start, end);

    separator.onProgress = progress => {
      const chunkFraction = progress.percent / 100;
      const overallPercent = ((index + chunkFraction) / totalChunks) * 100;
      baseOnProgress({
        ...progress,
        percent: overallPercent,
        passLabel: `Audio chunk ${index + 1}/${totalChunks}: ${progress.passLabel}`,
      });
    };

    onProgress({
      stage: 'chunk-prep',
      passLabel: `Audio chunk ${index + 1}/${totalChunks}: preparing ${Math.round((end - start) / SAMPLE_RATE)}s chunk...`,
      percent: (index / totalChunks) * 100,
      processedChunks: index,
      totalChunks,
    });

    const result = await timing.measureAsync('chunkedSeparate', () => separator.separate(chunk));
    primaryStemChunks.push(result.stems[primaryStem]);
    secondaryStemChunks.push(result.stems[secondaryStem]);
  }

  separator.onProgress = baseOnProgress;

  return {
    stems: {
      [primaryStem]: concatChannelPairs(primaryStemChunks),
      [secondaryStem]: concatChannelPairs(secondaryStemChunks),
    },
    primaryStem,
    secondaryStem,
  };
}
