import type { StereoChannels } from './types';

export function index4d(dims: number[], i0: number, i1: number, i2: number, i3: number): number {
  return (((i0 * dims[1] + i1) * dims[2] + i2) * dims[3]) + i3;
}

export function concatFloat32(parts: Float32Array[]): Float32Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function reflectPad(signal: Float32Array, leftPad: number, rightPad: number): Float32Array {
  const result = new Float32Array(leftPad + signal.length + rightPad);
  const last = signal.length - 1;

  for (let i = 0; i < leftPad; i += 1) {
    result[i] = signal[leftPad - i];
  }
  result.set(signal, leftPad);
  for (let i = 0; i < rightPad; i += 1) {
    result[leftPad + signal.length + i] = signal[last - 1 - i];
  }

  return result;
}

export function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) {
    result <<= 1;
  }
  return result;
}

export function scaleChannels(channels: StereoChannels, scale: number): StereoChannels {
  return channels.map(channel => {
    const output = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      output[i] = channel[i] * scale;
    }
    return output;
  }) as StereoChannels;
}

export function negateArray(data: Float32Array): Float32Array {
  const output = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    output[i] = -data[i];
  }
  return output;
}

export function sliceChannels(channels: StereoChannels, startSample: number, endSample: number): StereoChannels {
  return [
    channels[0].slice(startSample, endSample),
    channels[1].slice(startSample, endSample),
  ];
}

export function normalizeChannels(
  channels: StereoChannels,
  maxPeak: number,
  minPeak: number | null,
): { channels: StereoChannels; originalPeak: number } {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      peak = Math.max(peak, Math.abs(channel[i]));
    }
  }

  if (peak === 0) {
    return { channels, originalPeak: 0 };
  }

  let scale = 1;
  if (peak > maxPeak) {
    scale = maxPeak / peak;
  } else if (minPeak !== null && peak < minPeak && minPeak > 0) {
    scale = minPeak / peak;
  }

  const normalized = channels.map(channel => {
    const output = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      output[i] = channel[i] * scale;
    }
    return output;
  }) as StereoChannels;

  return { channels: normalized, originalPeak: peak };
}

export function createWindowCache(): { periodic: Map<number, Float32Array>; symmetric: Map<number, Float32Array> } {
  return {
    periodic: new Map(),
    symmetric: new Map(),
  };
}

export function getHannPeriodic(
  length: number,
  cache: { periodic: Map<number, Float32Array> },
): Float32Array {
  const hit = cache.periodic.get(length);
  if (hit) return hit;

  const window = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
  }
  cache.periodic.set(length, window);
  return window;
}

export function getHanning(
  length: number,
  cache: { symmetric: Map<number, Float32Array> },
): Float32Array {
  const hit = cache.symmetric.get(length);
  if (hit) return hit;

  const window = new Float32Array(length);
  if (length === 1) {
    window[0] = 1;
  } else {
    for (let i = 0; i < length; i += 1) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    }
  }
  cache.symmetric.set(length, window);
  return window;
}

export class FFT {
  private readonly size: number;

  constructor(size: number) {
    this.size = size;
  }

  public transform(real: Float64Array, imag: Float64Array): void {
    if (real.length !== imag.length || real.length !== this.size) {
      throw new Error('FFT input shape mismatch.');
    }

    if ((this.size & (this.size - 1)) === 0) {
      this.transformRadix2(real, imag);
    } else {
      this.transformBluestein(real, imag);
    }
  }

  public inverse(real: Float64Array, imag: Float64Array): void {
    for (let i = 0; i < this.size; i += 1) {
      imag[i] = -imag[i];
    }
    this.transform(real, imag);
    for (let i = 0; i < this.size; i += 1) {
      real[i] /= this.size;
      imag[i] = -imag[i] / this.size;
    }
  }

  private transformRadix2(real: Float64Array, imag: Float64Array): void {
    const n = this.size;
    const levels = Math.trunc(Math.log2(n));

    for (let i = 0; i < n; i += 1) {
      const j = reverseBits(i, levels);
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let size = 2; size <= n; size <<= 1) {
      const halfsize = size >>> 1;
      const tableStep = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + halfsize; j += 1, k += tableStep) {
          const angle = (2 * Math.PI * k) / n;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const tpre = real[j + halfsize] * cos + imag[j + halfsize] * sin;
          const tpim = -real[j + halfsize] * sin + imag[j + halfsize] * cos;
          real[j + halfsize] = real[j] - tpre;
          imag[j + halfsize] = imag[j] - tpim;
          real[j] += tpre;
          imag[j] += tpim;
        }
      }
    }
  }

  private transformBluestein(real: Float64Array, imag: Float64Array): void {
    const n = this.size;
    const m = nextPowerOfTwo((n * 2) + 1);
    const areal = new Float64Array(m);
    const aimag = new Float64Array(m);
    const breal = new Float64Array(m);
    const bimag = new Float64Array(m);
    const creal = new Float64Array(m);
    const cimag = new Float64Array(m);

    for (let i = 0; i < n; i += 1) {
      const angle = (Math.PI * ((i * i) % (n * 2))) / n;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      areal[i] = real[i] * cos + imag[i] * sin;
      aimag[i] = -real[i] * sin + imag[i] * cos;
      breal[i] = cos;
      bimag[i] = sin;
      if (i !== 0) {
        breal[m - i] = cos;
        bimag[m - i] = sin;
      }
    }

    convolveComplex(areal, aimag, breal, bimag, creal, cimag);

    for (let i = 0; i < n; i += 1) {
      const angle = (Math.PI * ((i * i) % (n * 2))) / n;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      real[i] = (creal[i] * cos) + (cimag[i] * sin);
      imag[i] = (-creal[i] * sin) + (cimag[i] * cos);
    }
  }
}

function reverseBits(x: number, bits: number): number {
  let y = 0;
  for (let i = 0; i < bits; i += 1) {
    y = (y << 1) | (x & 1);
    x >>>= 1;
  }
  return y;
}

function convolveComplex(
  xreal: Float64Array,
  ximag: Float64Array,
  yreal: Float64Array,
  yimag: Float64Array,
  outreal: Float64Array,
  outimag: Float64Array,
): void {
  const n = xreal.length;
  const fft = new FFT(n);
  const xr = new Float64Array(xreal);
  const xi = new Float64Array(ximag);
  const yr = new Float64Array(yreal);
  const yi = new Float64Array(yimag);

  fft.transform(xr, xi);
  fft.transform(yr, yi);

  for (let i = 0; i < n; i += 1) {
    const tempReal = (xr[i] * yr[i]) - (xi[i] * yi[i]);
    const tempImag = (xi[i] * yr[i]) + (xr[i] * yi[i]);
    xr[i] = tempReal;
    xi[i] = tempImag;
  }

  fft.inverse(xr, xi);
  outreal.set(xr);
  outimag.set(xi);
}
