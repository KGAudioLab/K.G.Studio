import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGProject } from '../core/KGProject';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { quarterNotesToTicks } from '../core/timing';
import {
  buildAudioTempoAnalysisSpanForRegion,
  DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS,
  detectTempoFromAudio,
  normalizeAudioTempoDetectionOptions,
} from './audioTempoDetection';

const { analyzeMock, guessMock } = vi.hoisted(() => ({
  analyzeMock: vi.fn(),
  guessMock: vi.fn(),
}));

vi.mock('web-audio-beat-detector', () => ({
  analyze: analyzeMock,
  guess: guessMock,
}));

describe('audio tempo detection', () => {
  beforeEach(() => {
    analyzeMock.mockReset();
    guessMock.mockReset();
  });

  it('normalizes defaults and clamps values into the supported tempo range', () => {
    expect(normalizeAudioTempoDetectionOptions()).toEqual(DEFAULT_AUDIO_TEMPO_DETECTION_OPTIONS);
    expect(normalizeAudioTempoDetectionOptions({ minTempo: 12, maxTempo: 400 })).toEqual({
      minTempo: 40,
      maxTempo: 240,
    });
  });

  it('rejects invalid tempo ranges', () => {
    expect(() => normalizeAudioTempoDetectionOptions({ minTempo: 140, maxTempo: 100 })).toThrow(
      'Minimum BPM must be lower than maximum BPM.',
    );
  });

  it('rounds the detected tempo and preserves the detected beat offset', async () => {
    analyzeMock.mockResolvedValue(124.6);
    guessMock.mockResolvedValue({ bpm: 125, offset: 0.42 });
    const audioBuffer = {} as AudioBuffer;

    const result = await detectTempoFromAudio(
      audioBuffer,
      { offsetSeconds: 1.5, durationSeconds: 8.25 },
      { minTempo: 90, maxTempo: 150 },
    );

    expect(analyzeMock).toHaveBeenCalledWith(
      audioBuffer,
      1.5,
      8.25,
      { minTempo: 90, maxTempo: 150 },
    );
    expect(guessMock).toHaveBeenCalledWith(
      audioBuffer,
      1.5,
      8.25,
      { minTempo: 90, maxTempo: 150 },
    );
    expect(result).toEqual({
      tempo: 124.6,
      bpm: 125,
      offsetSeconds: 0.42,
    });
  });

  it('builds an analysis span from the visible region length', () => {
    const project = new KGProject('Tempo detection', 32, 0, 120);
    const region = new KGAudioRegion(
      'audio', '1', 0, 'Audio', quarterNotesToTicks(8), quarterNotesToTicks(16),
      'file', 'file.wav', 20, 1.25,
    );

    expect(buildAudioTempoAnalysisSpanForRegion(project, region)).toEqual({
      offsetSeconds: 1.25,
      durationSeconds: 18.75,
    });
  });
});
