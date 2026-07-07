import { describe, expect, it } from 'vitest';
import {
  frequencyToMidiPitch,
  getSpectrogramAnalysisResolution,
  getSpectrogramPitchBinCount,
  getSpectrogramVisibleBinRange,
  mapFrequencyToSpectrogramPosition,
  mapMidiPitchToSpectrogramPosition,
  normalizeSpectrogramHeightResolution,
} from './spectrogramUtil';

describe('spectrogramUtil', () => {
  it('normalizes unsupported resolutions to the default 3x', () => {
    expect(normalizeSpectrogramHeightResolution(1)).toBe(1);
    expect(normalizeSpectrogramHeightResolution(3)).toBe(3);
    expect(normalizeSpectrogramHeightResolution(5)).toBe(5);
    expect(normalizeSpectrogramHeightResolution(2)).toBe(3);
    expect(normalizeSpectrogramHeightResolution(undefined)).toBe(3);
  });

  it('derives pitch bin counts from the full MIDI range', () => {
    expect(getSpectrogramPitchBinCount(1)).toBe(128);
    expect(getSpectrogramPitchBinCount(3)).toBe(384);
    expect(getSpectrogramPitchBinCount(5)).toBe(640);
  });

  it('doubles the internal analysis resolution for each user-facing option', () => {
    expect(getSpectrogramAnalysisResolution(1)).toBe(2);
    expect(getSpectrogramAnalysisResolution(3)).toBe(6);
    expect(getSpectrogramAnalysisResolution(5)).toBe(10);
  });

  it('maps MIDI pitches into full-range spectrogram positions', () => {
    expect(mapMidiPitchToSpectrogramPosition(0, 1)).toBe(0);
    expect(mapMidiPitchToSpectrogramPosition(12.5, 3)).toBe(38.5);
    expect(mapMidiPitchToSpectrogramPosition(127, 5)).toBe(637);
    expect(mapMidiPitchToSpectrogramPosition(-1, 3)).toBeNull();
    expect(mapMidiPitchToSpectrogramPosition(128, 3)).toBeNull();
  });

  it('converts frequencies into MIDI pitch space and spectrogram positions', () => {
    expect(frequencyToMidiPitch(440)).toBeCloseTo(69, 6);
    expect(mapFrequencyToSpectrogramPosition(440, 5)).toBeCloseTo(347, 6);
    expect(frequencyToMidiPitch(0)).toBeNull();
  });

  it('derives the visible C0-B7 subrange inside the full-resolution buffer', () => {
    expect(getSpectrogramVisibleBinRange(1)).toEqual({ start: 12, end: 108 });
    expect(getSpectrogramVisibleBinRange(3)).toEqual({ start: 36, end: 324 });
  });
});
