export const SPECTROGRAM_FULL_MIN_MIDI_PITCH = 0;
export const SPECTROGRAM_FULL_MAX_MIDI_PITCH = 127;
export const SPECTROGRAM_MIN_MIDI_PITCH = 12; // C0
export const SPECTROGRAM_MAX_MIDI_PITCH = 107; // B7
export const SPECTROGRAM_FULL_SEMITONES =
  SPECTROGRAM_FULL_MAX_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH + 1;
export const SPECTROGRAM_VISIBLE_SEMITONES =
  SPECTROGRAM_MAX_MIDI_PITCH - SPECTROGRAM_MIN_MIDI_PITCH + 1;
export const SPECTROGRAM_ANALYSIS_RESOLUTION_MULTIPLIER = 2;

export type SpectrogramHeightResolution = 1 | 3 | 5;

export const SPECTROGRAM_HEIGHT_RESOLUTION_OPTIONS: SpectrogramHeightResolution[] = [1, 3, 5];

export function normalizeSpectrogramHeightResolution(value: unknown): SpectrogramHeightResolution {
  if (value === 1 || value === 3 || value === 5) {
    return value;
  }
  return 3;
}

export function getSpectrogramPitchBinCount(
  resolution: number,
): number {
  return SPECTROGRAM_FULL_SEMITONES * resolution;
}

export function getSpectrogramVisibleBinRange(
  resolution: number,
): { start: number; end: number } {
  return {
    start: (SPECTROGRAM_MIN_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH) * resolution,
    end: (SPECTROGRAM_MAX_MIDI_PITCH - SPECTROGRAM_FULL_MIN_MIDI_PITCH + 1) * resolution,
  };
}

export function getSpectrogramAnalysisResolution(
  resolution: SpectrogramHeightResolution,
): number {
  return resolution * SPECTROGRAM_ANALYSIS_RESOLUTION_MULTIPLIER;
}

export function mapMidiPitchToSpectrogramPosition(
  midiPitch: number,
  resolution: number,
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

export function frequencyToMidiPitch(frequency: number): number | null {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    return null;
  }
  return 69 + 12 * Math.log2(frequency / 440);
}

export function mapFrequencyToSpectrogramPosition(
  frequency: number,
  resolution: number,
): number | null {
  const midiPitch = frequencyToMidiPitch(frequency);
  if (midiPitch === null) {
    return null;
  }
  return mapMidiPitchToSpectrogramPosition(midiPitch, resolution);
}
