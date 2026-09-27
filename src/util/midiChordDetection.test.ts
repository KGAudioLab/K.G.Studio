import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import {
  DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
  buildMidiChordRegionSpans,
  buildMidiChordWindowsForRegion,
  detectChordsFromMidi,
  type DetectedMidiChord,
  type MidiChordDetectionOptions,
} from './midiChordDetection';
import { quarterNotesToTicks } from '../core/timing';

const q = quarterNotesToTicks;

function createProject(): KGProject {
  return new KGProject('Chord Test', 32, 0, 125, { numerator: 4, denominator: 4 });
}

function createRegion(notes: Array<{ startTick: number; endTick: number; pitch: number; velocity?: number }>, startTick = 0, length = 4): KGMidiRegion {
  const region = new KGMidiRegion('region-1', '1', 0, 'Region', q(startTick), q(length));
  notes.forEach((note, index) => {
    region.addNote(new KGMidiNote(
      `note-${index}`,
      q(note.startTick),
      q(note.endTick),
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
  it('builds one globally aligned window per beat', () => {
    const project = createProject();
    const region = createRegion([], 0, 4);

    expect(buildMidiChordWindowsForRegion(project, region)).toEqual([
      { barIndex: 0, startTick: q(0), endTick: q(1) },
      { barIndex: 0, startTick: q(1), endTick: q(2) },
      { barIndex: 0, startTick: q(2), endTick: q(3) },
      { barIndex: 0, startTick: q(3), endTick: q(4) },
    ]);
  });

  it('clips edge windows for a region that starts and ends between beats', () => {
    const project = createProject();
    const region = createRegion([], 0.25, 2.5);

    expect(buildMidiChordWindowsForRegion(project, region)).toEqual([
      { barIndex: 0, startTick: q(0.25), endTick: q(1) },
      { barIndex: 0, startTick: q(1), endTick: q(2) },
      { barIndex: 0, startTick: q(2), endTick: q(2.75) },
    ]);
  });

  it('uses app-timeline beats and numerator-based bar boundaries in compound meter', () => {
    const project = new KGProject('Compound Meter', 32, 0, 125, { numerator: 6, denominator: 8 });
    const region = createRegion([], 5, 2);

    expect(buildMidiChordWindowsForRegion(project, region)).toEqual([
      { barIndex: 1, startTick: q(5), endTick: q(6) },
      { barIndex: 2, startTick: q(6), endTick: q(7) },
    ]);
  });

  it('detects a clean minor triad', () => {
    const region = createRegion([
      { startTick: 0, endTick: 4, pitch: 45 },
      { startTick: 0, endTick: 4, pitch: 57 },
      { startTick: 0, endTick: 4, pitch: 60 },
      { startTick: 0, endTick: 4, pitch: 64 },
    ]);

    expect(detectRegionChords(region).map(result => result.symbol)).toEqual(['Am', 'Am', 'Am', 'Am']);
  });

  it('detects a dominant seventh when enabled', () => {
    const region = createRegion([
      { startTick: 0, endTick: 4, pitch: 52 },
      { startTick: 0, endTick: 4, pitch: 64 },
      { startTick: 0, endTick: 4, pitch: 68 },
      { startTick: 0, endTick: 4, pitch: 71 },
      { startTick: 0, endTick: 4, pitch: 74 },
    ]);

    expect(detectRegionChords(region, { enableSevenths: true })[0]?.symbol).toBe('E7');
  });

  it('detects a root-doubled suspended fourth voicing', () => {
    const region = createRegion([
      { startTick: 0, endTick: 1, pitch: 47 },
      { startTick: 0, endTick: 1, pitch: 59 },
      { startTick: 0, endTick: 1, pitch: 64 },
      { startTick: 0, endTick: 1, pitch: 66 },
    ], 0, 1);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Bsus4');
  });

  it.each([
    { symbol: 'Csus2', pitches: [48, 60, 62, 67] },
    { symbol: 'Cdim', pitches: [48, 60, 63, 66] },
    { symbol: 'Caug', pitches: [48, 60, 64, 68] },
    { symbol: 'C5', pitches: [48, 60, 67] },
  ])('detects the $symbol chord family', ({ symbol, pitches }) => {
    const region = createRegion(
      pitches.map(pitch => ({ startTick: 0, endTick: 1, pitch })),
      0,
      1,
    );

    expect(detectRegionChords(region)[0]?.symbol).toBe(symbol);
  });

  it.each([
    { symbol: 'C7sus2', pitches: [48, 60, 62, 67, 70] },
    { symbol: 'C7sus4', pitches: [48, 60, 65, 67, 70] },
    { symbol: 'Cm7b5', pitches: [48, 60, 63, 66, 70] },
    { symbol: 'Cdim7', pitches: [48, 60, 63, 66, 69] },
  ])('detects the $symbol seventh family when enabled', ({ symbol, pitches }) => {
    const region = createRegion(
      pitches.map(pitch => ({ startTick: 0, endTick: 1, pitch })),
      0,
      1,
    );

    expect(detectRegionChords(region, { enableSevenths: true })[0]?.symbol).toBe(symbol);
  });

  it('continues to detect B major when the major third is present', () => {
    const region = createRegion([
      { startTick: 0, endTick: 1, pitch: 47 },
      { startTick: 0, endTick: 1, pitch: 59 },
      { startTick: 0, endTick: 1, pitch: 63 },
      { startTick: 0, endTick: 1, pitch: 66 },
    ], 0, 1);

    expect(detectRegionChords(region)[0]?.symbol).toBe('B');
  });

  it('keeps short melody notes from flipping the chord', () => {
    const region = createRegion([
      { startTick: 0, endTick: 4, pitch: 45 },
      { startTick: 0, endTick: 4, pitch: 57 },
      { startTick: 0, endTick: 4, pitch: 60 },
      { startTick: 0, endTick: 4, pitch: 64 },
      { startTick: 0.25, endTick: 0.5, pitch: 67 },
      { startTick: 1.25, endTick: 1.5, pitch: 71 },
      { startTick: 2.25, endTick: 2.5, pitch: 74 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Am');
  });

  it('prefers the sustained harmony over non-chord embellishments', () => {
    const region = createRegion([
      { startTick: 0, endTick: 4, pitch: 41 },
      { startTick: 0, endTick: 4, pitch: 53 },
      { startTick: 0, endTick: 4, pitch: 57 },
      { startTick: 0, endTick: 4, pitch: 60 },
      { startTick: 0, endTick: 0.25, pitch: 62 },
      { startTick: 1, endTick: 1.25, pitch: 64 },
      { startTick: 2, endTick: 2.25, pitch: 67 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('F');
  });

  it('returns no chord for sparse windows', () => {
    const region = createRegion([
      { startTick: 0, endTick: 0.5, pitch: 60 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('N');
  });

  it('resolves inversions to the intended root chord', () => {
    const region = createRegion([
      { startTick: 0, endTick: 4, pitch: 64 },
      { startTick: 0, endTick: 4, pitch: 69 },
      { startTick: 0, endTick: 4, pitch: 72 },
      { startTick: 0, endTick: 4, pitch: 76 },
    ]);

    expect(detectRegionChords(region)[0]?.symbol).toBe('Am');
  });

  it('detects chord changes at beat granularity', () => {
    const region = createRegion([
      { startTick: 0, endTick: 1, pitch: 48 },
      { startTick: 0, endTick: 1, pitch: 60 },
      { startTick: 0, endTick: 1, pitch: 64 },
      { startTick: 0, endTick: 1, pitch: 67 },
      { startTick: 1, endTick: 2, pitch: 53 },
      { startTick: 1, endTick: 2, pitch: 65 },
      { startTick: 1, endTick: 2, pitch: 69 },
      { startTick: 1, endTick: 2, pitch: 72 },
    ], 0, 2);

    expect(detectRegionChords(region).map(result => result.symbol)).toEqual(['C', 'F']);
  });

  it('coalesces matching beats within a bar but cuts at the next bar', () => {
    const results: DetectedMidiChord[] = [
      { barIndex: 0, startTick: 2, endTick: 3, symbol: 'C', confidence: 0.8, noteCount: 3 },
      { barIndex: 0, startTick: 3, endTick: 4, symbol: 'C', confidence: 0.7, noteCount: 3 },
      { barIndex: 1, startTick: 4, endTick: 5, symbol: 'C', confidence: 0.9, noteCount: 4 },
      { barIndex: 1, startTick: 5, endTick: 6, symbol: 'C', confidence: 0.6, noteCount: 3 },
    ];

    expect(buildMidiChordRegionSpans(results)).toEqual([
      { startTick: 2, endTick: 4, symbol: 'C' },
      { startTick: 4, endTick: 6, symbol: 'C' },
    ]);
    expect(results[0]).toEqual({
      barIndex: 0,
      startTick: 2,
      endTick: 3,
      symbol: 'C',
      confidence: 0.8,
      noteCount: 3,
    });
  });

  it('keeps no-chord beats as gaps between matching chords', () => {
    const results: DetectedMidiChord[] = [
      { barIndex: 0, startTick: 0, endTick: 1, symbol: 'C', confidence: 0.8, noteCount: 3 },
      { barIndex: 0, startTick: 1, endTick: 2, symbol: 'C', confidence: 0.8, noteCount: 3 },
      { barIndex: 0, startTick: 2, endTick: 3, symbol: 'N', confidence: 0, noteCount: 0 },
      { barIndex: 0, startTick: 3, endTick: 4, symbol: 'C', confidence: 0.8, noteCount: 3 },
    ];

    expect(buildMidiChordRegionSpans(results)).toEqual([
      { startTick: 0, endTick: 2, symbol: 'C' },
      { startTick: 3, endTick: 4, symbol: 'C' },
    ]);
  });
});
