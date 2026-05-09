export const SPECTROGRAM_FULL_MIN_MIDI_PITCH = 0;
export const SPECTROGRAM_FULL_MAX_MIDI_PITCH = 127;
export const SPECTROGRAM_MIN_MIDI_PITCH = 12; // C0
export const SPECTROGRAM_MAX_MIDI_PITCH = 107; // B7
export const SPECTROGRAM_FULL_SEMITONES =
  SPECTROGRAM_FULL_MAX_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH + 1;
export const SPECTROGRAM_VISIBLE_SEMITONES =
  SPECTROGRAM_MAX_MIDI_PITCH - SPECTROGRAM_MIN_MIDI_PITCH + 1;

export type SpectrogramHeightResolution = 1 | 3 | 5;

export const SPECTROGRAM_HEIGHT_RESOLUTION_OPTIONS: SpectrogramHeightResolution[] = [1, 3, 5];

export function normalizeSpectrogramHeightResolution(value: unknown): SpectrogramHeightResolution {
  if (value === 1 || value === 3 || value === 5) {
    return value;
  }
  return 3;
}

export function getSpectrogramPitchBinCount(
  resolution: SpectrogramHeightResolution,
): number {
  return SPECTROGRAM_FULL_SEMITONES * resolution;
}

export function getSpectrogramVisibleBinRange(
  resolution: SpectrogramHeightResolution,
): { start: number; end: number } {
  return {
    start: (SPECTROGRAM_MIN_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH) * resolution,
    end: (SPECTROGRAM_MAX_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH + 1) * resolution,
  };
}

export function mapMidiPitchToSpectrogramPosition(
  midiPitch: number,
  resolution: SpectrogramHeightResolution,
): number | null {
  const pitchOffset = midiPitch - SPECTROGRAM_FULL_MIN_MIDI_PITCH;
  if (pitchOffset < 0 || pitchOffset > SPECTROGRAM_FULL_MAX_MIDI_PITCH) {
    return null;
  }

  // Anchor each MIDI pitch to the center of its semitone band so the
  // rendered ridge lines up with the piano-roll key row rather than a boundary.
  const scaled = pitchOffset * resolution + (resolution - 1) / 2;
  const maxBin = getSpectrogramPitchBinCount(resolution) - 1;
  return Math.max(0, Math.min(maxBin, scaled));
}
