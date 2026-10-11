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

// Evaluate three peaking filters mathematically, without creating audio nodes.
export function previewResponseDb(bands: EqBand[], frequency: number): number {
  const sampleRate = 48000;
  const w = 2 * Math.PI * frequency / sampleRate;
  return bands.reduce((total, band) => {
    const center = 2 * Math.PI * band.frequency / sampleRate;
    const a = Math.pow(10, band.gain / 40);
    const alpha = Math.sin(center) / (2 * band.q);
    const b = [1 + alpha * a, -2 * Math.cos(center), 1 - alpha * a];
    const d = [1 + alpha / a, -2 * Math.cos(center), 1 - alpha / a];
    const magnitudeSquared = (c: number[]) => {
      const real = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w);
      const imaginary = -c[1] * Math.sin(w) - c[2] * Math.sin(2 * w);
      return real * real + imaginary * imaginary;
    };
    return total + 10 * Math.log10(magnitudeSquared(b) / magnitudeSquared(d));
  }, 0);
}
