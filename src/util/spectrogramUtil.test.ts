import { describe, expect, it } from 'vitest';
import {
  getSpectrogramPitchBinCount,
  getSpectrogramVisibleBinRange,
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

  it('maps MIDI pitches into full-range spectrogram positions', () => {
    expect(mapMidiPitchToSpectrogramPosition(0, 1)).toBe(0);
    expect(mapMidiPitchToSpectrogramPosition(12.5, 3)).toBe(38.5);
    expect(mapMidiPitchToSpectrogramPosition(127, 5)).toBe(637);
    expect(mapMidiPitchToSpectrogramPosition(-1, 3)).toBeNull();
    expect(mapMidiPitchToSpectrogramPosition(128, 3)).toBeNull();
  });

  it('derives the visible C0-B7 subrange inside the full-resolution buffer', () => {
    expect(getSpectrogramVisibleBinRange(1)).toEqual({ start: 12, end: 108 });
    expect(getSpectrogramVisibleBinRange(3)).toEqual({ start: 36, end: 324 });
  });
});
