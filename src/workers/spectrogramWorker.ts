import FFT from 'fft.js';

type WorkerScopeLike = typeof globalThis & {
  onmessage: ((event: MessageEvent<SpectrogramRequest>) => void) | null;
  postMessage: (message: SpectrogramResult, transfer: Transferable[]) => void;
};

const workerScope = self as WorkerScopeLike;

export interface SpectrogramRequest {
  pcm: Float32Array;
  sampleRate: number;
  clipStartOffsetSeconds: number;
  regionDurationSeconds: number;
  bpm: number;
}

export interface SpectrogramResult {
  data: Float32Array; // [timeSteps × 128] row-major, row = time step, col = pitch 0-127
  timeSteps: number;
}

const FFT_SIZE = 8192;
const HOP_SIZE = 1024;
const PITCH_BINS = 128;

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

workerScope.onmessage = (e: MessageEvent<SpectrogramRequest>) => {
  const { pcm, sampleRate, clipStartOffsetSeconds, regionDurationSeconds } = e.data;

  const startSample = Math.floor(clipStartOffsetSeconds * sampleRate);
  const endSample = Math.min(pcm.length, startSample + Math.ceil(regionDurationSeconds * sampleRate));
  const regionSamples = pcm.subarray(startSample, endSample);

  const fft = new FFT(FFT_SIZE);
  const hann = hannWindow(FFT_SIZE);
  const complexOut = fft.createComplexArray() as number[];
  const inputPadded = new Float32Array(FFT_SIZE);

  const totalHops = Math.max(1, Math.ceil((regionSamples.length - FFT_SIZE) / HOP_SIZE) + 1);
  const result = new Float32Array(totalHops * PITCH_BINS);

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
    const pitchRow = hop * PITCH_BINS;
    const numBins = FFT_SIZE / 2;

    for (let bin = 1; bin < numBins; bin++) {
      const freq = (bin * sampleRate) / FFT_SIZE;
      if (freq < 20 || freq > 20000) continue;

      // Convert frequency to MIDI pitch; clamp to piano roll range C0–B7 (MIDI 12–107)
      const pitch = Math.round(69 + 12 * Math.log2(freq / 440));
      if (pitch < 12 || pitch > 107) continue;

      const re = complexOut[2 * bin];
      const im = complexOut[2 * bin + 1];
      const magnitude = Math.sqrt(re * re + im * im);

      if (magnitude > result[pitchRow + pitch]) {
        result[pitchRow + pitch] = magnitude;
      }
    }

    // Track global max for normalization
    for (let p = 0; p < PITCH_BINS; p++) {
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

  const response: SpectrogramResult = { data: result, timeSteps: totalHops };
  workerScope.postMessage(response, [result.buffer]);
};
