import FFT from 'fft.js';
import {
  SPECTROGRAM_FULL_MAX_MIDI_PITCH,
  SPECTROGRAM_FULL_MIN_MIDI_PITCH,
  getSpectrogramAnalysisResolution,
  getSpectrogramPitchBinCount,
} from './spectrogramUtil';

const FFT_SIZE = 16384;
const HOP_SIZE = 512;
const MAX_HEIGHT_RESOLUTION = 5;
const MIN_ANALYSIS_FREQUENCY = 20;
const MAX_ANALYSIS_FREQUENCY = 5000;

export interface AudioToMidiDetectionRequest {
  pcm: Float32Array;
  sampleRate: number;
  startSeconds: number;
  endSeconds: number;
  floorDb: number;
  pitchRangeStart: number;
  pitchRangeEnd: number;
  groupAdjacentPitchesToHighest: boolean;
}

export interface AudioToMidiDetectedNote {
  startOffsetSeconds: number;
  endOffsetSeconds: number;
  pitch: number;
  heat: number;
}

const HANN_WINDOW = (() => {
  const window = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }
  return window;
})();

function midiToFrequency(midiPitch: number): number {
  return 440 * Math.pow(2, (midiPitch - 69) / 12);
}

function frequencyToMidiPitch(frequency: number): number | null {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }
  return 69 + 12 * Math.log2(frequency / 440);
}

function mapMidiPitchToPosition(midiPitch: number, resolution: number): number | null {
  const pitchOffset = midiPitch - SPECTROGRAM_FULL_MIN_MIDI_PITCH;
  if (pitchOffset < 0 || pitchOffset > SPECTROGRAM_FULL_MAX_MIDI_PITCH) {
    return null;
  }

  const scaled = pitchOffset * resolution + (resolution - 1) / 2;
  const maxBin = getSpectrogramPitchBinCount(resolution) - 1;
  return Math.max(0, Math.min(maxBin, scaled));
}

function estimateParabolicPeakOffset(leftMagnitude: number, centerMagnitude: number, rightMagnitude: number): number {
  const denominator = leftMagnitude - 2 * centerMagnitude + rightMagnitude;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < Number.EPSILON) {
    return 0;
  }

  const offset = 0.5 * (leftMagnitude - rightMagnitude) / denominator;
  return Math.max(-0.5, Math.min(0.5, offset));
}

function estimatePeakFrequency(bin: number, hzPerBin: number, magnitudes: Float32Array): number {
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

function getFrequencyBandEdges(centerFrequency: number, hzPerBin: number): { lowerFrequency: number; upperFrequency: number } {
  const halfBandwidth = hzPerBin / 2;
  return {
    lowerFrequency: Math.max(Number.EPSILON, centerFrequency - halfBandwidth),
    upperFrequency: centerFrequency + halfBandwidth,
  };
}

function paintMagnitudeAcrossPitchSpan(
  target: Float32Array,
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
    if (overlap <= 0) {
      continue;
    }

    const overlapWeight = Math.min(1, overlap);
    const centerDistance = Math.abs(targetBin - centerPosition);
    const centerWeight = Math.max(0, 1 - centerDistance / (spanWidth + 1));
    const weight = Math.max(overlapWeight * (0.6 + 0.4 * centerWeight), overlapWeight * 0.35);
    const weightedMagnitude = magnitude * weight;

    if (weightedMagnitude > target[targetBin]) {
      target[targetBin] = weightedMagnitude;
    }
  }
}

function collapseAdjacentPitchClusters(activeBins: number[], frameBins: Float32Array): number[] {
  if (activeBins.length === 0) {
    return [];
  }

  const grouped: number[] = [];
  let clusterStart = 0;

  while (clusterStart < activeBins.length) {
    let clusterEnd = clusterStart;
    let strongestBin = activeBins[clusterStart];
    let strongestValue = frameBins[strongestBin];

    while (
      clusterEnd + 1 < activeBins.length &&
      activeBins[clusterEnd + 1] <= activeBins[clusterEnd] + 1
    ) {
      clusterEnd += 1;
      const candidateBin = activeBins[clusterEnd];
      const candidateValue = frameBins[candidateBin];
      if (candidateValue > strongestValue) {
        strongestBin = candidateBin;
        strongestValue = candidateValue;
      }
    }

    grouped.push(strongestBin);
    clusterStart = clusterEnd + 1;
  }

  return grouped;
}

function normalizePitchBinToMidiPitch(bin: number, resolution: number): number {
  return Math.round((bin - ((resolution - 1) / 2)) / resolution);
}

export function detectMonophonicNotesFromAudio(request: AudioToMidiDetectionRequest): AudioToMidiDetectedNote[] {
  const {
    pcm,
    sampleRate,
    startSeconds,
    endSeconds,
    floorDb,
    pitchRangeStart,
    pitchRangeEnd,
    groupAdjacentPitchesToHighest,
  } = request;

  const clampedStartSeconds = Math.max(0, startSeconds);
  const clampedEndSeconds = Math.max(clampedStartSeconds, endSeconds);
  const startSample = Math.max(0, Math.floor(clampedStartSeconds * sampleRate));
  const endSample = Math.min(pcm.length, Math.ceil(clampedEndSeconds * sampleRate));
  const sampleCount = Math.max(0, endSample - startSample);
  if (sampleCount <= 0) {
    return [];
  }

  const analysisResolution = getSpectrogramAnalysisResolution(MAX_HEIGHT_RESOLUTION);
  const pitchBins = getSpectrogramPitchBinCount(analysisResolution);
  const fft = new FFT(FFT_SIZE);
  const complexOut = fft.createComplexArray() as number[];
  const inputPadded = new Float32Array(FFT_SIZE);
  const hzPerBin = sampleRate / FFT_SIZE;
  const totalHops = Math.max(1, Math.ceil((sampleCount - FFT_SIZE) / HOP_SIZE) + 1);
  const frameBinValues: Float32Array[] = [];
  let globalMax = 0;

  const minFrequency = Math.max(MIN_ANALYSIS_FREQUENCY, midiToFrequency(Math.max(0, pitchRangeStart - 2)));
  const maxFrequency = Math.min(MAX_ANALYSIS_FREQUENCY, midiToFrequency(Math.min(127, pitchRangeEnd + 2)));

  for (let hop = 0; hop < totalHops; hop++) {
    const frameBins = new Float32Array(pitchBins);
    const offset = hop * HOP_SIZE;
    inputPadded.fill(0);
    const available = Math.min(FFT_SIZE, sampleCount - offset);

    for (let i = 0; i < available; i++) {
      inputPadded[i] = pcm[startSample + offset + i] * HANN_WINDOW[i];
    }

    fft.realTransform(complexOut, inputPadded as unknown as number[]);
    fft.completeSpectrum(complexOut);

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
      if (upperFrequency < minFrequency || lowerFrequency > maxFrequency) {
        continue;
      }

      const magnitude = magnitudes[bin];
      if (magnitude <= 0) {
        continue;
      }

      const lowerMidi = frequencyToMidiPitch(Math.max(lowerFrequency, minFrequency));
      const upperMidi = frequencyToMidiPitch(Math.min(upperFrequency, maxFrequency));
      const centerMidi = frequencyToMidiPitch(centerFrequency);
      if (lowerMidi === null || upperMidi === null || centerMidi === null) {
        continue;
      }

      const startPosition = mapMidiPitchToPosition(lowerMidi, analysisResolution);
      const endPosition = mapMidiPitchToPosition(upperMidi, analysisResolution);
      const centerPosition = mapMidiPitchToPosition(centerMidi, analysisResolution);
      if (startPosition === null || endPosition === null || centerPosition === null) {
        continue;
      }

      paintMagnitudeAcrossPitchSpan(
        frameBins,
        pitchBins,
        Math.min(startPosition, endPosition),
        Math.max(startPosition, endPosition),
        centerPosition,
        magnitude,
      );
    }

    for (let i = 0; i < frameBins.length; i++) {
      if (frameBins[i] > globalMax) {
        globalMax = frameBins[i];
      }
    }

    frameBinValues.push(frameBins);
  }

  if (globalMax <= 0) {
    return [];
  }

  const linearThreshold = Math.pow(10, floorDb / 20);
  const hopDurationSeconds = HOP_SIZE / sampleRate;
  const notes: AudioToMidiDetectedNote[] = [];
  let current: AudioToMidiDetectedNote | null = null;
  let currentHeatSum = 0;
  let currentFrameCount = 0;

  for (let frameIndex = 0; frameIndex < frameBinValues.length; frameIndex++) {
    const normalizedBins = frameBinValues[frameIndex].slice();
    const activeBins: number[] = [];

    for (let i = 0; i < normalizedBins.length; i++) {
      normalizedBins[i] = normalizedBins[i] / globalMax;
      if (normalizedBins[i] >= linearThreshold) {
        activeBins.push(i);
      }
    }

    const candidateBins = groupAdjacentPitchesToHighest
      ? collapseAdjacentPitchClusters(activeBins, normalizedBins)
      : activeBins;

    let winningPitch: number | null = null;
    let winningHeat = 0;

    for (const bin of candidateBins) {
      const heat = normalizedBins[bin];
      if (heat <= winningHeat) {
        continue;
      }

      const midiPitch = normalizePitchBinToMidiPitch(bin, analysisResolution);
      if (midiPitch < pitchRangeStart || midiPitch > pitchRangeEnd) {
        continue;
      }

      winningPitch = midiPitch;
      winningHeat = heat;
    }

    const frameStartSeconds = frameIndex * hopDurationSeconds;
    const frameEndSeconds = Math.min((frameIndex + 1) * hopDurationSeconds, clampedEndSeconds - clampedStartSeconds);

    if (winningPitch === null) {
      if (current) {
        current.heat = currentHeatSum / Math.max(1, currentFrameCount);
        notes.push(current);
        current = null;
        currentHeatSum = 0;
        currentFrameCount = 0;
      }
      continue;
    }

    if (current && current.pitch === winningPitch) {
      current.endOffsetSeconds = frameEndSeconds;
      currentHeatSum += winningHeat;
      currentFrameCount += 1;
      continue;
    }

    if (current) {
      current.heat = currentHeatSum / Math.max(1, currentFrameCount);
      notes.push(current);
    }

    // Future polyphonic support should preserve the strongest bin inside an
    // adjacent cluster (for example C4 over weaker B3/D4 neighbors) before
    // selecting additional simultaneous note candidates.
    current = {
      startOffsetSeconds: frameStartSeconds,
      endOffsetSeconds: frameEndSeconds,
      pitch: winningPitch,
      heat: winningHeat,
    };
    currentHeatSum = winningHeat;
    currentFrameCount = 1;
  }

  if (current) {
    current.heat = currentHeatSum / Math.max(1, currentFrameCount);
    notes.push(current);
  }

  return notes;
}
