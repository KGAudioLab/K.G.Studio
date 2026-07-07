import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KGProject } from '../core/KGProject';
import type { KGAudioRegion } from '../core/region/KGAudioRegion';
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
    const project = {
      getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
      getBpm: () => 120,
      getMaxBars: () => 32,
      getGlobalTrackByType: () => null,
    } as unknown as KGProject;
    const region = {
      getStartFromBeat: () => 8,
      getLength: () => 16,
      getAudioDurationSeconds: () => 20,
      getClipStartOffsetSeconds: () => 1.25,
    } as unknown as KGAudioRegion;

    expect(buildAudioTempoAnalysisSpanForRegion(project, region)).toEqual({
      offsetSeconds: 1.25,
      durationSeconds: 18.75,
    });
  });
});
