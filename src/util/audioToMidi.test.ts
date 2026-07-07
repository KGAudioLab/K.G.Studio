import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import {
  buildAudioToMidiAnalysisSpan,
  convertDetectedAudioNotesToRawMidiNotes,
  detectMonophonicNotesFromAudio,
} from './audioToMidi';

function createSineWavePcm(
  frequency: number,
  durationSeconds: number,
  sampleRate: number,
  amplitude: number = 0.8,
): Float32Array {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const pcm = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    pcm[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return pcm;
}

describe('audioToMidi analysis span helpers', () => {
  it('uses the exact source audio region bounds when loop mode is off', () => {
    const project = new KGProject('Test', 32, 0, 120);
    const region = new KGAudioRegion('audio-1', '1', 0, 'Audio', 8, 4, 'file-1', 'test.wav', 10, 1.5);

    const span = buildAudioToMidiAnalysisSpan(project, region, {
      loopModeEnabled: false,
      convertLoopRangeOnly: true,
      loopingRange: [0, 0],
    });

    expect(span).toEqual({
      regionStartBeat: 8,
      regionEndBeat: 12,
      startSeconds: 1.5,
      endSeconds: 3.5,
    });
  });

  it('uses the exact loop overlap when loop-only conversion is enabled', () => {
    const project = new KGProject('Test', 32, 0, 120);
    const region = new KGAudioRegion('audio-1', '1', 0, 'Audio', 8, 8, 'file-1', 'test.wav', 10, 0.5);

    const span = buildAudioToMidiAnalysisSpan(project, region, {
      loopModeEnabled: true,
      convertLoopRangeOnly: true,
      loopingRange: [3, 4],
    });

    expect(span).toEqual({
      regionStartBeat: 12,
      regionEndBeat: 16,
      startSeconds: 2.5,
      endSeconds: 4.5,
    });
  });
});

describe('audioToMidi note conversion helpers', () => {
  it('drops raw notes shorter than the selected quantized note length and quantizes survivors', () => {
    const project = new KGProject('Test', 32, 0, 120);
    const rawNotes = convertDetectedAudioNotesToRawMidiNotes(
      project,
      {
        regionStartBeat: 8,
        regionEndBeat: 12,
        startSeconds: 0,
        endSeconds: 2,
      },
      [
        { startOffsetSeconds: 0.0, endOffsetSeconds: 0.24, pitch: 33, heat: 0.9 },
        { startOffsetSeconds: 0.5, endOffsetSeconds: 1.45, pitch: 38, heat: 0.7 },
      ],
      {
        quantizeNoteStart: '1/16',
        quantizeNoteLength: '1/4',
      },
    );

    expect(rawNotes).toEqual([
      {
        startBeat: 1,
        endBeat: 3,
        pitch: 38,
        velocity: 102,
      },
    ]);
  });
});

describe('audioToMidi synthetic detection', () => {
  it('detects sequential monophonic notes from a simple sine-wave fixture', () => {
    const sampleRate = 44100;
    const a1 = createSineWavePcm(55, 0.7, sampleRate);
    const silence = new Float32Array(Math.floor(0.08 * sampleRate));
    const d2 = createSineWavePcm(73.41619197935188, 0.7, sampleRate);
    const pcm = new Float32Array(a1.length + silence.length + d2.length);
    pcm.set(a1, 0);
    pcm.set(silence, a1.length);
    pcm.set(d2, a1.length + silence.length);

    const notes = detectMonophonicNotesFromAudio({
      pcm,
      sampleRate,
      startSeconds: 0,
      endSeconds: pcm.length / sampleRate,
      floorDb: -30,
      pitchRangeStart: 21,
      pitchRangeEnd: 38,
      groupAdjacentPitchesToHighest: true,
    });

    expect(notes.map(note => note.pitch)).toEqual([33, 38]);
  });
});
