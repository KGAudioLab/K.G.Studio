import { EQ_BAND_TYPES } from '../../core/fx/KGEQFX';

export interface EqBand {
  frequency: number;
  q: number;
  gain: number;
}

export const EQ_MIN_FREQUENCY = 20;
export const EQ_MAX_FREQUENCY = 20000;
export const EQ_GAIN_RANGE = 18;
export const EQ_MIN_Q = 0.1;
export const EQ_MAX_Q = 10;

export function createPreviewBands(): EqBand[] {
  return [200, 1350, 6500].map(frequency => ({ frequency, q: 0.5, gain: 0 }));
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const frequencyToPosition = (frequency: number) => Math.log(frequency / EQ_MIN_FREQUENCY) / Math.log(EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY);
export const positionToFrequency = (position: number) => EQ_MIN_FREQUENCY * Math.pow(EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY, clamp(position, 0, 1));

// Match native low-shelf, peaking, and high-shelf biquads without audio nodes.
// Native shelves use a fixed slope and do not use Q.
export function previewResponseDb(bands: EqBand[], frequency: number, sampleRate = 48000): number {
  const w = 2 * Math.PI * frequency / sampleRate;
  return bands.reduce((total, band, index) => {
    const center = 2 * Math.PI * Math.min(band.frequency, sampleRate / 2 - 1) / sampleRate;
    const a = Math.pow(10, band.gain / 40);
    const cosine = Math.cos(center);
    let b: number[];
    let d: number[];
    if (EQ_BAND_TYPES[index] === 'peaking') {
      const alpha = Math.sin(center) / (2 * band.q);
      b = [1 + alpha * a, -2 * cosine, 1 - alpha * a];
      d = [1 + alpha / a, -2 * cosine, 1 - alpha / a];
    } else {
      const beta = 2 * Math.sqrt(a) * Math.sin(center) / Math.sqrt(2);
      const plus = a + 1;
      const minus = a - 1;
      if (EQ_BAND_TYPES[index] === 'lowshelf') {
        b = [a * (plus - minus * cosine + beta), 2 * a * (minus - plus * cosine), a * (plus - minus * cosine - beta)];
        d = [plus + minus * cosine + beta, -2 * (minus + plus * cosine), plus + minus * cosine - beta];
      } else {
        b = [a * (plus + minus * cosine + beta), -2 * a * (minus + plus * cosine), a * (plus + minus * cosine - beta)];
        d = [plus - minus * cosine + beta, 2 * (minus - plus * cosine), plus - minus * cosine - beta];
      }
    }
    const magnitudeSquared = (c: number[]) => {
      const real = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w);
      const imaginary = -c[1] * Math.sin(w) - c[2] * Math.sin(2 * w);
      return real * real + imaginary * imaginary;
    };
    return total + 10 * Math.log10(magnitudeSquared(b) / magnitudeSquared(d));
  }, 0);
}
