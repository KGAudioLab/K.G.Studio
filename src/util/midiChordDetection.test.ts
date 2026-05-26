import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import {
  DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
  buildMidiChordWindowsForRegion,
  detectChordsFromMidi,
  type MidiChordDetectionOptions,
} from './midiChordDetection';

function createProject(): KGProject {
  return new KGProject('Chord Test', 32, 0, 125, { numerator: 4, denominator: 4 });
}

function createRegion(notes: Array<{ startBeat: number; endBeat: number; pitch: number; velocity?: number }>, startFromBeat = 0, length = 4): KGMidiRegion {
  const region = new KGMidiRegion('region-1', '1', 0, 'Region', startFromBeat, length);
  notes.forEach((note, index) => {
    region.addNote(new KGMidiNote(
      `note-${index}`,
      note.startBeat,
      note.endBeat,
      note.pitch,
      note.velocity ?? 100,
    ));
  });
  return region;
}

function detectRegionChords(
  region: KGMidiRegion,
  options?: Partial<MidiChordDetectionOptions>,
) {
  const project = createProject();
  const windows = buildMidiChordWindowsForRegion(project, region);
  return detectChordsFromMidi({
    project,
    region,
    windows,
    options: {
      ...DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
      ...options,
    },
  });
}

describe('midi chord detection', () => {
  it('detects a clean minor triad', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 4, pitch: 45 },
      { startBeat: 0, endBeat: 4, pitch: 57 },
      { startBeat: 0, endBeat: 4, pitch: 60 },
      { startBeat: 0, endBeat: 4, pitch: 64 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Am');
  });

  it('detects a dominant seventh when enabled', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 4, pitch: 52 },
      { startBeat: 0, endBeat: 4, pitch: 64 },
      { startBeat: 0, endBeat: 4, pitch: 68 },
      { startBeat: 0, endBeat: 4, pitch: 71 },
      { startBeat: 0, endBeat: 4, pitch: 74 },
    ]);

    expect(detectRegionChords(region, { enableSevenths: true })[0]?.symbol).toBe('E7');
  });

  it('keeps short melody notes from flipping the chord', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 4, pitch: 45 },
      { startBeat: 0, endBeat: 4, pitch: 57 },
      { startBeat: 0, endBeat: 4, pitch: 60 },
      { startBeat: 0, endBeat: 4, pitch: 64 },
      { startBeat: 0.25, endBeat: 0.5, pitch: 67 },
      { startBeat: 1.25, endBeat: 1.5, pitch: 71 },
      { startBeat: 2.25, endBeat: 2.5, pitch: 74 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Am');
  });

  it('prefers the sustained harmony over non-chord embellishments', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 4, pitch: 41 },
      { startBeat: 0, endBeat: 4, pitch: 53 },
      { startBeat: 0, endBeat: 4, pitch: 57 },
      { startBeat: 0, endBeat: 4, pitch: 60 },
      { startBeat: 0, endBeat: 0.25, pitch: 62 },
      { startBeat: 1, endBeat: 1.25, pitch: 64 },
      { startBeat: 2, endBeat: 2.25, pitch: 67 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('F');
  });

  it('returns no chord for sparse windows', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 0.5, pitch: 60 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('N');
  });

  it('resolves inversions to the intended root chord', () => {
    const region = createRegion([
      { startBeat: 0, endBeat: 4, pitch: 64 },
      { startBeat: 0, endBeat: 4, pitch: 69 },
      { startBeat: 0, endBeat: 4, pitch: 72 },
      { startBeat: 0, endBeat: 4, pitch: 76 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Am');
  });
});
