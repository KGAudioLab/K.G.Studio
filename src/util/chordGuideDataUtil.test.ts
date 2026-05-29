import { beforeEach, describe, expect, it } from 'vitest';
import { Note } from 'tonal';
import { KGCore } from '../core/KGCore';
import { getMatchingChordGuideChordsForPitch, resolveChordGuideItems } from './chordGuideDataUtil';
import { getChordPitchClasses, parseChordSymbol } from './chordUtil';
import chordGuideData from '../../public/resources/modes/chord_guide.json';

function getExpectedPitchClassesFromNotes(notes: string[]): number[] {
  return notes.map((note) => {
    const parsed = Note.get(note);
    if (parsed.empty || parsed.chroma === undefined) {
      throw new Error(`Unable to convert note "${note}" to pitch class`);
    }
    return parsed.chroma;
  });
}

describe('chordGuideDataUtil', () => {
  beforeEach(() => {
    KGCore.CHORD_GUIDE_DATA = chordGuideData;
    KGCore.FUNCTIONAL_CHORDS_DATA = {
      ionian: { name: 'Broken', steps: [2, 2, 2, 2, 2, 1, 1], T: [], S: [], D: [], chords: {} },
    };
  });

  it('parses every chord symbol used by chord_guide.json', () => {
    const allItems = [
      ...chordGuideData.ionian.T,
      ...chordGuideData.ionian.S,
      ...chordGuideData.ionian.D,
      ...chordGuideData.aeolian.T,
      ...chordGuideData.aeolian.S,
      ...chordGuideData.aeolian.D,
    ];

    for (const item of allItems) {
      const parsed = parseChordSymbol(item.name);
      expect(parsed, item.name).not.toBeNull();
      expect(parsed?.symbol).toBe(item.name);
    }
  });

  it('maps every chord guide symbol to the corresponding notes declared in chord_guide.json', () => {
    const allItems = [
      ...chordGuideData.ionian.T,
      ...chordGuideData.ionian.S,
      ...chordGuideData.ionian.D,
      ...chordGuideData.aeolian.T,
      ...chordGuideData.aeolian.S,
      ...chordGuideData.aeolian.D,
    ];

    for (const item of allItems) {
      const actualPitchClasses = getChordPitchClasses(item.name).map((pitch) => ((pitch % 12) + 12) % 12);
      const expectedPitchClasses = getExpectedPitchClassesFromNotes(item.notes);

      expect(
        actualPitchClasses,
        `${item.name} should resolve to ${item.notes.join(' ')}`
      ).toEqual(expectedPitchClasses);
    }
  });

  it('resolves ionian tonic chords in C major from the new chord guide data', () => {
    const result = resolveChordGuideItems('C major', 'ionian', 'T');

    expect(result[0]).toMatchObject({
      name: 'C',
      roman: 'I',
      notes: ['C', 'E', 'G'],
      resolvedNotes: ['C', 'E', 'G'],
      pitchClasses: [0, 4, 7],
    });
    expect(result.find((item) => item.name === 'Am')?.pitchClasses).toEqual([9, 12, 16]);
  });

  it('transposes ionian tonic chords away from C major', () => {
    const result = resolveChordGuideItems('D major', 'ionian', 'T');

    expect(result[0]).toMatchObject({
      name: 'C',
      resolvedNotes: ['D', 'F#', 'A'],
      pitchClasses: [2, 6, 9],
    });
    expect(result.find((item) => item.name === 'Am')?.resolvedNotes).toEqual(['B', 'D', 'F#']);
  });

  it('uses A minor as the aeolian reference tonic', () => {
    const result = resolveChordGuideItems('A minor', 'aeolian', 'T');

    expect(result[0]).toMatchObject({
      name: 'Am',
      resolvedNotes: ['A', 'C', 'E'],
      pitchClasses: [9, 12, 16],
    });
    expect(result.find((item) => item.name === 'Amadd9')?.resolvedNotes).toEqual(['A', 'C', 'E', 'B']);
  });

  it('transposes aeolian tonic chords away from A minor', () => {
    const result = resolveChordGuideItems('E minor', 'aeolian', 'T');

    expect(result[0]).toMatchObject({
      name: 'Am',
      resolvedNotes: ['E', 'G', 'B'],
      pitchClasses: [4, 7, 11],
    });
    expect(result.find((item) => item.name === 'C')?.resolvedNotes).toEqual(['G', 'B', 'D']);
  });

  it('matches hover chords without depending on functional chord config', () => {
    const result = getMatchingChordGuideChordsForPitch(60, 'C major', 'ionian', 'T');

    expect(result[0]).toEqual([0, 4, 7]);
    expect(result.some((chord) => chord.includes(0))).toBe(true);
  });
});
