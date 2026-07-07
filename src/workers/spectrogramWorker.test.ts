import { describe, expect, it } from 'vitest';
import { getSpectrogramPitchBinCount, mapFrequencyToSpectrogramPosition } from '../util/spectrogramUtil';
import {
  estimatePeakFrequency,
  getFrequencyBandEdges,
  paintMagnitudeAcrossPitchSpan,
} from './spectrogramWorker';

const FFT_SIZE = 16384;
const SAMPLE_RATE = 44100;
const HZ_PER_BIN = SAMPLE_RATE / FFT_SIZE;

function paintSpanForFrequency(
  centerFrequency: number,
  resolution: 1 | 3 | 5,
  pitchBins = getSpectrogramPitchBinCount(resolution),
): Float32Array {
  const row = new Float32Array(pitchBins);
  const { lowerFrequency, upperFrequency } = getFrequencyBandEdges(centerFrequency, HZ_PER_BIN);
  const startPosition = mapFrequencyToSpectrogramPosition(lowerFrequency, resolution);
  const endPosition = mapFrequencyToSpectrogramPosition(upperFrequency, resolution);
  const centerPosition = mapFrequencyToSpectrogramPosition(centerFrequency, resolution);

  if (startPosition === null || endPosition === null || centerPosition === null) {
    throw new Error('Expected mapped pitch positions for test frequency span');
  }

  paintMagnitudeAcrossPitchSpan(
    row,
    0,
    pitchBins,
    Math.min(startPosition, endPosition),
    Math.max(startPosition, endPosition),
    centerPosition,
    1,
  );
  return row;
}

describe('spectrogramWorker helpers', () => {
  it('keeps adjacent low-register FFT bins continuous at 5x resolution', () => {
    const pitchBins = getSpectrogramPitchBinCount(5);
    const row = new Float32Array(pitchBins);
    const binsAroundA1 = [10, 11];

    for (const bin of binsAroundA1) {
      const centerFrequency = bin * HZ_PER_BIN;
      const { lowerFrequency, upperFrequency } = getFrequencyBandEdges(centerFrequency, HZ_PER_BIN);
      const startPosition = mapFrequencyToSpectrogramPosition(lowerFrequency, 5);
      const endPosition = mapFrequencyToSpectrogramPosition(upperFrequency, 5);
      const centerPosition = mapFrequencyToSpectrogramPosition(centerFrequency, 5);

      expect(startPosition).not.toBeNull();
      expect(endPosition).not.toBeNull();
      expect(centerPosition).not.toBeNull();

      paintMagnitudeAcrossPitchSpan(
        row,
        0,
        pitchBins,
        Math.min(startPosition!, endPosition!),
        Math.max(startPosition!, endPosition!),
        centerPosition!,
        1,
      );
    }

    const nonZeroBins = [...row.entries()].filter(([, value]) => value > 0).map(([index]) => index);
    expect(nonZeroBins.length).toBeGreaterThan(0);

    for (let index = nonZeroBins[0]; index <= nonZeroBins[nonZeroBins.length - 1]; index++) {
      expect(row[index]).toBeGreaterThan(0);
    }
  });

  it('uses sub-bin interpolation to move the ridge closer to the true peak frequency', () => {
    const magnitudes = new Float32Array([0, 0.3, 1.0, 0.82, 0.1, 0]);
    const rawCenterFrequency = 2 * HZ_PER_BIN;
    const interpolatedFrequency = estimatePeakFrequency(2, HZ_PER_BIN, magnitudes);
    const expectedFrequency = (2.35 * HZ_PER_BIN);

    expect(Math.abs(interpolatedFrequency - expectedFrequency)).toBeLessThan(
      Math.abs(rawCenterFrequency - expectedFrequency),
    );
  });

  it('leaves non-peak bins at their raw FFT center while still painting a span', () => {
    const magnitudes = new Float32Array([0, 0.2, 0.4, 1.0, 0.8, 0.7, 0.2, 0]);
    const centerFrequency = estimatePeakFrequency(4, HZ_PER_BIN, magnitudes);
    expect(centerFrequency).toBeCloseTo(4 * HZ_PER_BIN, 6);

    const row = paintSpanForFrequency(centerFrequency, 3);
    expect(row.some(value => value > 0)).toBe(true);
  });

  it('maps edge-band spans into the valid spectrogram range without spilling outside the buffer', () => {
    const lowRow = paintSpanForFrequency(20.5, 5);
    const lowNonZeroBins = [...lowRow.entries()].filter(([, value]) => value > 0).map(([index]) => index);
    expect(lowNonZeroBins.length).toBeGreaterThan(0);
    expect(lowNonZeroBins[0]).toBeGreaterThanOrEqual(0);

    const highRow = paintSpanForFrequency(12530, 5);
    const highNonZeroBins = [...highRow.entries()].filter(([, value]) => value > 0).map(([index]) => index);
    expect(highNonZeroBins.length).toBeGreaterThan(0);
    expect(highNonZeroBins[highNonZeroBins.length - 1]).toBeLessThan(highRow.length);
  });
});
