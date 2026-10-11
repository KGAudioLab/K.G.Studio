import { EQ_MAX_FREQUENCY, EQ_MIN_FREQUENCY, positionToFrequency } from './eqPreview';

/** Spectrum levels have their own -90..0 dBFS scale, independent of EQ gain. */
export function eqSpectrumPath(data: Float32Array, sampleRate: number, width: number, height: number): string {
  const binHz = sampleRate / (2 * data.length);
  const points = 200;
  let path = `M0,${height}`;
  const topFrequency = Math.min(EQ_MAX_FREQUENCY, sampleRate / 2);
  const endPosition = Math.min(1, Math.log(topFrequency / EQ_MIN_FREQUENCY) / Math.log(EQ_MAX_FREQUENCY / EQ_MIN_FREQUENCY));
  for (let i = 0; i <= points; i++) {
    const position = i / points * endPosition;
    const bin = positionToFrequency(position) / binHz;
    const low = Math.min(data.length - 1, Math.floor(bin));
    const high = Math.min(data.length - 1, low + 1);
    const finite = (value: number) => Number.isFinite(value) ? Math.max(-90, Math.min(0, value)) : -90;
    let db = finite(data[low]) * (1 - (bin - low)) + finite(data[high]) * (bin - low);
    // Preserve narrow peaks when several linear FFT bins share one display interval.
    const nextBin = Math.min(data.length - 1, Math.floor(positionToFrequency(Math.min(endPosition, position + endPosition / points)) / binHz));
    for (let j = low + 1; j <= nextBin; j++) db = Math.max(db, finite(data[j]));
    const y = height * (1 - Math.max(0, Math.min(1, (db + 90) / 90)));
    path += ` L${(position * width).toFixed(2)},${y.toFixed(2)}`;
  }
  return `${path} L${(endPosition * width).toFixed(2)},${height} Z`;
}
