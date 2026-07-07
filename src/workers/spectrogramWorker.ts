import FFT from 'fft.js';
import {
  getSpectrogramAnalysisResolution,
  getSpectrogramPitchBinCount,
  mapFrequencyToSpectrogramPosition,
  normalizeSpectrogramHeightResolution,
  type SpectrogramHeightResolution,
} from '../util/spectrogramUtil';

type WorkerScopeLike = typeof globalThis & {
  onmessage: ((event: MessageEvent<SpectrogramRequest>) => void) | null;
  postMessage: (message: SpectrogramResult, transfer: Transferable[]) => void;
};

const workerScope = typeof self === 'undefined' ? null : self as WorkerScopeLike;

export interface SpectrogramRequest {
  pcm: Float32Array;
  sampleRate: number;
  clipStartOffsetSeconds: number;
  regionDurationSeconds: number;
  bpm: number;
  heightResolution: SpectrogramHeightResolution;
}

export interface SpectrogramResult {
  data: Float32Array; // [timeSteps × pitchBins] row-major, low-to-high pitch bins
  timeSteps: number;
  pitchBins: number;
}

const FFT_SIZE = 16384;
const HOP_SIZE = 1024;
const MIN_SPECTROGRAM_FREQUENCY = 20;
const MAX_SPECTROGRAM_FREQUENCY = 20000;

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

export function getFrequencyBandEdges(
  centerFrequency: number,
  hzPerBin: number,
): { lowerFrequency: number; upperFrequency: number } {
  const halfBandwidth = hzPerBin / 2;
  return {
    lowerFrequency: Math.max(Number.EPSILON, centerFrequency - halfBandwidth),
    upperFrequency: centerFrequency + halfBandwidth,
  };
}

export function estimateParabolicPeakOffset(
  leftMagnitude: number,
  centerMagnitude: number,
  rightMagnitude: number,
): number {
  const denominator = leftMagnitude - 2 * centerMagnitude + rightMagnitude;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < Number.EPSILON) {
    return 0;
  }

  const offset = 0.5 * (leftMagnitude - rightMagnitude) / denominator;
  return Math.max(-0.5, Math.min(0.5, offset));
}

export function estimatePeakFrequency(
  bin: number,
  hzPerBin: number,
  magnitudes: Float32Array,
): number {
  const centerFrequency = bin * hzPerBin;
  if (bin <= 1 || bin >= magnitudes.length - 1) {
    return centerFrequency;
  }

  const leftMagnitude = magnitudes[bin - 1];
  const centerMagnitude = magnitudes[bin];
  const rightMagnitude = magnitudes[bin + 1];

  if (centerMagnitude <= leftMagnitude || centerMagnitude <= rightMagnitude) {
    return centerFrequency;
  }

  return (bin + estimateParabolicPeakOffset(leftMagnitude, centerMagnitude, rightMagnitude)) * hzPerBin;
}

function getPitchSpanBounds(
  lowerFrequency: number,
  upperFrequency: number,
  centerFrequency: number,
  analysisResolution: number,
): { startPosition: number; endPosition: number; centerPosition: number } | null {
  const startPosition = mapFrequencyToSpectrogramPosition(lowerFrequency, analysisResolution);
  const endPosition = mapFrequencyToSpectrogramPosition(upperFrequency, analysisResolution);
  const centerPosition = mapFrequencyToSpectrogramPosition(centerFrequency, analysisResolution);

  if (startPosition === null || endPosition === null || centerPosition === null) {
    return null;
  }

  return {
    startPosition: Math.min(startPosition, endPosition),
    endPosition: Math.max(startPosition, endPosition),
    centerPosition,
  };
}

export function paintMagnitudeAcrossPitchSpan(
  result: Float32Array,
  pitchRow: number,
  pitchBins: number,
  startPosition: number,
  endPosition: number,
  centerPosition: number,
  magnitude: number,
): void {
  const clampedStart = Math.max(0, Math.min(startPosition, pitchBins - 1));
  const clampedEnd = Math.max(0, Math.min(endPosition, pitchBins - 1));
  const startBin = Math.max(0, Math.floor(clampedStart));
  const endBin = Math.min(pitchBins - 1, Math.ceil(clampedEnd));
  const spanWidth = Math.max(clampedEnd - clampedStart, 1);

  for (let targetBin = startBin; targetBin <= endBin; targetBin++) {
    const cellStart = targetBin - 0.5;
    const cellEnd = targetBin + 0.5;
    const overlap = Math.max(0, Math.min(clampedEnd, cellEnd) - Math.max(clampedStart, cellStart));
    if (overlap <= 0) continue;

    const overlapWeight = Math.min(1, overlap);
    const centerDistance = Math.abs(targetBin - centerPosition);
    const centerWeight = Math.max(0, 1 - centerDistance / (spanWidth + 1));
    const weight = Math.max(overlapWeight * (0.6 + 0.4 * centerWeight), overlapWeight * 0.35);

    const weightedMagnitude = magnitude * weight;
    const resultIndex = pitchRow + targetBin;
    if (weightedMagnitude > result[resultIndex]) {
      result[resultIndex] = weightedMagnitude;
    }
  }
}

function handleSpectrogramRequest(e: MessageEvent<SpectrogramRequest>, scope: WorkerScopeLike): void {
  const {
    pcm,
    sampleRate,
    clipStartOffsetSeconds,
    regionDurationSeconds,
    heightResolution,
  } = e.data;
  const normalizedResolution = normalizeSpectrogramHeightResolution(heightResolution);
  const analysisResolution = getSpectrogramAnalysisResolution(normalizedResolution);
  const pitchBins = getSpectrogramPitchBinCount(analysisResolution);

  const startSample = Math.floor(clipStartOffsetSeconds * sampleRate);
  const endSample = Math.min(pcm.length, startSample + Math.ceil(regionDurationSeconds * sampleRate));
  const regionSamples = pcm.subarray(startSample, endSample);

  const fft = new FFT(FFT_SIZE);
  const hann = hannWindow(FFT_SIZE);
  const complexOut = fft.createComplexArray() as number[];
  const inputPadded = new Float32Array(FFT_SIZE);
  const hzPerBin = sampleRate / FFT_SIZE;

  const totalHops = Math.max(1, Math.ceil((regionSamples.length - FFT_SIZE) / HOP_SIZE) + 1);
  const result = new Float32Array(totalHops * pitchBins);

  let maxVal = 0;

  for (let hop = 0; hop < totalHops; hop++) {
    const offset = hop * HOP_SIZE;

    // Fill windowed frame (zero-pad at end if needed)
    inputPadded.fill(0);
    const available = Math.min(FFT_SIZE, regionSamples.length - offset);
    for (let i = 0; i < available; i++) {
      inputPadded[i] = regionSamples[offset + i] * hann[i];
    }

    fft.realTransform(complexOut, inputPadded as unknown as number[]);
    fft.completeSpectrum(complexOut);

    // Max-pool magnitude into pitch bins: keep the loudest FFT bin per semitone,
    // rather than summing. Summing inflates every bin by how many FFT bins land there.
    const pitchRow = hop * pitchBins;
    const numBins = FFT_SIZE / 2;
    const magnitudes = new Float32Array(numBins);

    for (let bin = 1; bin < numBins; bin++) {
      const re = complexOut[2 * bin];
      const im = complexOut[2 * bin + 1];
      magnitudes[bin] = Math.sqrt(re * re + im * im);
    }

    for (let bin = 1; bin < numBins; bin++) {
      const centerFrequency = estimatePeakFrequency(bin, hzPerBin, magnitudes);
      const { lowerFrequency, upperFrequency } = getFrequencyBandEdges(centerFrequency, hzPerBin);
      if (upperFrequency < MIN_SPECTROGRAM_FREQUENCY || lowerFrequency > MAX_SPECTROGRAM_FREQUENCY) continue;

      const clampedLowerFrequency = Math.max(lowerFrequency, MIN_SPECTROGRAM_FREQUENCY);
      const clampedUpperFrequency = Math.min(upperFrequency, MAX_SPECTROGRAM_FREQUENCY);
      const clampedCenterFrequency = Math.min(
        clampedUpperFrequency,
        Math.max(clampedLowerFrequency, centerFrequency),
      );
      const pitchSpan = getPitchSpanBounds(
        clampedLowerFrequency,
        clampedUpperFrequency,
        clampedCenterFrequency,
        analysisResolution,
      );
      if (!pitchSpan) continue;

      const magnitude = magnitudes[bin];
      if (magnitude <= 0) continue;

      paintMagnitudeAcrossPitchSpan(
        result,
        pitchRow,
        pitchBins,
        pitchSpan.startPosition,
        pitchSpan.endPosition,
        pitchSpan.centerPosition,
        magnitude,
      );
    }

    // Track global max for normalization
    for (let p = 0; p < pitchBins; p++) {
      if (result[pitchRow + p] > maxVal) maxVal = result[pitchRow + p];
    }
  }

  // Linear normalization only — threshold and power curve are applied in the canvas
  // renderer so changing them is instant (no need to re-run the FFT).
  if (maxVal > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = result[i] / maxVal;
    }
  }

  const response: SpectrogramResult = { data: result, timeSteps: totalHops, pitchBins };
  scope.postMessage(response, [result.buffer]);
}

if (workerScope) {
  workerScope.onmessage = (e: MessageEvent<SpectrogramRequest>) => {
    handleSpectrogramRequest(e, workerScope);
  };
}
