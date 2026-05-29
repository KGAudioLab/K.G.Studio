import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
  detectChordsFromAudio,
  type AudioChordDetectionOptions,
  type AudioChordDetectionRequest,
} from './audioChordDetectionCore';

const SAMPLE_RATE = 44100;

function createSineChordPcm(frequencies: number[], durationSeconds: number): Float32Array {
  const sampleCount = Math.floor(durationSeconds * SAMPLE_RATE);
  const pcm = new Float32Array(sampleCount);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    const time = sampleIndex / SAMPLE_RATE;
    let sample = 0;
    for (const frequency of frequencies) {
      sample += Math.sin(2 * Math.PI * frequency * time);
    }
    pcm[sampleIndex] = (sample / Math.max(1, frequencies.length)) * 0.35;
  }

  return pcm;
}

function createRequest(
  windows: AudioChordDetectionRequest['windows'],
  pcm: Float32Array,
  options?: Partial<AudioChordDetectionOptions>,
): AudioChordDetectionRequest {
  return {
    pcm,
    sampleRate: SAMPLE_RATE,
    clipStartOffsetSeconds: 0,
    windows,
    options: {
      ...DEFAULT_AUDIO_CHORD_DETECTION_OPTIONS,
      ...options,
    },
  };
}

describe('audio chord detection', () => {
  it('detects a major triad from synthetic audio', () => {
    const pcm = createSineChordPcm([261.63, 329.63, 392.0], 2);
    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm));

    expect(result.symbol).toBe('C');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('detects a minor triad from synthetic audio', () => {
    const pcm = createSineChordPcm([220.0, 261.63, 329.63], 2);
    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm));

    expect(result.symbol).toBe('Am');
  });

  it('marks silent analysis windows as no chord', () => {
    const pcm = new Float32Array(SAMPLE_RATE * 2);
    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm));

    expect(result.symbol).toBe('N');
    expect(result.confidence).toBe(0);
  });

  it('keeps neighboring synthetic bars stable', () => {
    const barA = createSineChordPcm([220.0, 261.63, 329.63], 2);
    const barB = createSineChordPcm([220.0, 261.63, 329.63], 2);
    const pcm = new Float32Array(barA.length + barB.length);
    pcm.set(barA, 0);
    pcm.set(barB, barA.length);

    const results = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
      { barIndex: 1, startBeat: 4, endBeat: 8, startSeconds: 2, endSeconds: 4 },
    ], pcm));

    expect(results.map(result => result.symbol)).toEqual(['Am', 'Am']);
  });

  it('uses default options to preserve current triad-first behavior', () => {
    const pcm = createSineChordPcm([329.63, 415.3, 493.88, 587.33], 2);
    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm));

    expect(result.symbol).toBe('E');
  });

  it('can emit a seventh label when chord detail is enabled', () => {
    const pcm = createSineChordPcm([329.63, 415.3, 493.88, 587.33], 2);
    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm, { enableSevenths: true }));

    expect(result.symbol).toBe('E7');
  });

  it('can suppress a weak bar when no-chord threshold is increased', () => {
    const pcm = createSineChordPcm([261.63, 329.63, 392.0], 2);
    for (let sampleIndex = 0; sampleIndex < pcm.length; sampleIndex++) {
      pcm[sampleIndex] *= 0.04;
    }

    const [result] = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
    ], pcm, { noChordThreshold: 95 }));

    expect(result.symbol).toBe('N');
  });

  it('changes smoothing behavior when stability is lowered', () => {
    const barA = createSineChordPcm([220.0, 261.63, 329.63], 2);
    const barB = createSineChordPcm([261.63, 329.63], 2);
    for (let sampleIndex = 0; sampleIndex < barB.length; sampleIndex++) {
      barB[sampleIndex] *= 0.3;
    }
    const barC = createSineChordPcm([220.0, 261.63, 329.63], 2);
    const pcm = new Float32Array(barA.length + barB.length + barC.length);
    pcm.set(barA, 0);
    pcm.set(barB, barA.length);
    pcm.set(barC, barA.length + barB.length);

    const stableResults = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
      { barIndex: 1, startBeat: 4, endBeat: 8, startSeconds: 2, endSeconds: 4 },
      { barIndex: 2, startBeat: 8, endBeat: 12, startSeconds: 4, endSeconds: 6 },
    ], pcm, { stability: 100 }));
    const unstableResults = detectChordsFromAudio(createRequest([
      { barIndex: 0, startBeat: 0, endBeat: 4, startSeconds: 0, endSeconds: 2 },
      { barIndex: 1, startBeat: 4, endBeat: 8, startSeconds: 2, endSeconds: 4 },
      { barIndex: 2, startBeat: 8, endBeat: 12, startSeconds: 4, endSeconds: 6 },
    ], pcm, { stability: 0 }));

    expect(stableResults[1].symbol).toBe('Am');
    expect(unstableResults[1].symbol).not.toBe('Am');
  });
});
