import { describe, expect, it } from 'vitest';
import { detectChordsFromAudio, type AudioChordDetectionRequest } from './audioChordDetectionCore';

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

function createRequest(windows: AudioChordDetectionRequest['windows'], pcm: Float32Array): AudioChordDetectionRequest {
  return {
    pcm,
    sampleRate: SAMPLE_RATE,
    clipStartOffsetSeconds: 0,
    windows,
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
});
