import type { LocalSeparatorMdxModelConfig, StereoChannels } from './types';
import { FFT, createWindowCache, getHannPeriodic, index4d, reflectPad } from './shared';

interface SpectrogramPayload {
  data: Float32Array;
  dims: number[];
  frames?: number;
}

export class LocalSeparatorCpuDsp {
  public readonly window: Float32Array;
  public readonly dimF: number;
  public readonly forwardFft: FFT;

  private readonly nFft: number;
  private readonly hopLength: number;
  private readonly trim: number;
  private readonly numFreqBins: number;
  private readonly inverseFft: FFT;

  constructor(config: LocalSeparatorMdxModelConfig) {
    this.nFft = config.metadata.mdx_n_fft_scale_set;
    this.hopLength = config.defaults.hopLength;
    this.dimF = config.metadata.mdx_dim_f_set;
    this.trim = Math.floor(this.nFft / 2);
    this.numFreqBins = Math.floor(this.nFft / 2) + 1;
    const windowCache = createWindowCache();
    this.window = getHannPeriodic(this.nFft, windowCache);
    this.forwardFft = new FFT(this.nFft);
    this.inverseFft = new FFT(this.nFft);
  }

  public async forwardStereo(leftChunk: Float32Array, rightChunk: Float32Array): Promise<SpectrogramPayload> {
    const paddedLeft = reflectPad(leftChunk, this.trim, this.trim);
    const paddedRight = reflectPad(rightChunk, this.trim, this.trim);
    const frames = Math.floor((paddedLeft.length - this.nFft) / this.hopLength) + 1;
    const tensor = new Float32Array(4 * this.dimF * frames);
    const dims = [1, 4, this.dimF, frames];

    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      const offset = frameIndex * this.hopLength;
      const leftSpectrum = this.frameSpectrum(paddedLeft, offset);
      const rightSpectrum = this.frameSpectrum(paddedRight, offset);

      for (let freq = 0; freq < this.dimF; freq += 1) {
        tensor[index4d(dims, 0, 0, freq, frameIndex)] = freq < 3 ? 0 : leftSpectrum.real[freq];
        tensor[index4d(dims, 0, 1, freq, frameIndex)] = freq < 3 ? 0 : leftSpectrum.imag[freq];
        tensor[index4d(dims, 0, 2, freq, frameIndex)] = freq < 3 ? 0 : rightSpectrum.real[freq];
        tensor[index4d(dims, 0, 3, freq, frameIndex)] = freq < 3 ? 0 : rightSpectrum.imag[freq];
      }
    }

    return { data: tensor, dims, frames };
  }

  public async inverseStereo(spectrogramPayload: SpectrogramPayload): Promise<StereoChannels> {
    const spectrogram = spectrogramPayload.data;
    const dims = spectrogramPayload.dims;
    const [, channels, freqBins, frames] = dims;
    if (channels !== 4) {
      throw new Error(`Expected 4 channels in MDX spectrogram, got ${channels}`);
    }

    const outputLength = ((frames - 1) * this.hopLength) + this.nFft;
    const left = new Float64Array(outputLength);
    const right = new Float64Array(outputLength);
    const leftWindowSums = new Float64Array(outputLength);
    const rightWindowSums = new Float64Array(outputLength);

    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      const leftFrame = this.istftFrame(spectrogram, dims, 0, 1, frameIndex, freqBins);
      const rightFrame = this.istftFrame(spectrogram, dims, 2, 3, frameIndex, freqBins);
      const frameOffset = frameIndex * this.hopLength;

      for (let i = 0; i < this.nFft; i += 1) {
        const weightedLeft = leftFrame[i] * this.window[i];
        const weightedRight = rightFrame[i] * this.window[i];
        left[frameOffset + i] += weightedLeft;
        right[frameOffset + i] += weightedRight;
        const weight = this.window[i] * this.window[i];
        leftWindowSums[frameOffset + i] += weight;
        rightWindowSums[frameOffset + i] += weight;
      }
    }

    const normalizedLeft = new Float32Array(outputLength - (this.trim * 2));
    const normalizedRight = new Float32Array(outputLength - (this.trim * 2));
    for (let i = this.trim; i < outputLength - this.trim; i += 1) {
      const outIndex = i - this.trim;
      normalizedLeft[outIndex] = leftWindowSums[i] > 1e-8 ? left[i] / leftWindowSums[i] : 0;
      normalizedRight[outIndex] = rightWindowSums[i] > 1e-8 ? right[i] / rightWindowSums[i] : 0;
    }

    return [normalizedLeft, normalizedRight];
  }

  public dispose(): void {}

  private frameSpectrum(signal: Float32Array, offset: number): { real: Float64Array; imag: Float64Array } {
    const real = new Float64Array(this.nFft);
    const imag = new Float64Array(this.nFft);
    for (let i = 0; i < this.nFft; i += 1) {
      real[i] = signal[offset + i] * this.window[i];
    }
    this.forwardFft.transform(real, imag);
    return { real, imag };
  }

  private istftFrame(
    spectrogram: Float32Array,
    dims: number[],
    realChannel: number,
    imagChannel: number,
    frameIndex: number,
    freqBins: number,
  ): Float32Array {
    const real = new Float64Array(this.nFft);
    const imag = new Float64Array(this.nFft);

    for (let freq = 0; freq < freqBins; freq += 1) {
      real[freq] = spectrogram[index4d(dims, 0, realChannel, freq, frameIndex)];
      imag[freq] = spectrogram[index4d(dims, 0, imagChannel, freq, frameIndex)];
    }

    for (let freq = 1; freq < this.numFreqBins - 1; freq += 1) {
      const mirrored = this.nFft - freq;
      real[mirrored] = real[freq];
      imag[mirrored] = -imag[freq];
    }

    this.inverseFft.inverse(real, imag);

    const frame = new Float32Array(this.nFft);
    for (let i = 0; i < this.nFft; i += 1) {
      frame[i] = real[i];
    }
    return frame;
  }
}
