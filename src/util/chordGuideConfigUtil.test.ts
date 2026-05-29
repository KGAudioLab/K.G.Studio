import { describe, expect, it } from 'vitest';
import chordGuideDataJson from '../../public/resources/modes/chord_guide.json';
import type { ChordGuideData } from '../core/ChordGuideTypes';
import {
  buildChordGuideCustomConfigFromData,
  buildChordGuideDataFromDefaultsAndConfig,
  buildDerivedChordGuideItem,
  createDefaultChordForGroup,
  deriveChordGuideNotes,
  deriveChordGuideSource,
} from './chordGuideConfigUtil';

const chordGuideData = chordGuideDataJson as ChordGuideData;

describe('chordGuideConfigUtil', () => {
  it('derives canonical note names from a chord symbol', () => {
    expect(deriveChordGuideNotes('Dm7')).toEqual(['D', 'F', 'A', 'C']);
    expect(deriveChordGuideNotes('Eaug')).toEqual(['E', 'G#', 'C']);
  });

  it('classifies major-group diatonic and non-diatonic chords', () => {
    expect(deriveChordGuideSource('Dm7', 'major')).toBe('Diatonic');
    expect(deriveChordGuideSource('Bb', 'major')).toBe('Non-Diatonic');
    expect(deriveChordGuideSource('D7', 'major')).toBe('Non-Diatonic');
  });

  it('classifies minor-group borrowed chords as non-diatonic', () => {
    expect(deriveChordGuideSource('Am', 'minor')).toBe('Diatonic');
    expect(deriveChordGuideSource('E7', 'minor')).toBe('Non-Diatonic');
  });

  it('builds a derived chord guide item with trimmed note text', () => {
    const result = buildDerivedChordGuideItem('major', {
      name: 'Cmaj7',
      note: '  bright tonic  ',
      roman: 'Imaj7',
    });

    expect(result).toEqual({
      name: 'Cmaj7',
      roman: 'Imaj7',
      notes: ['C', 'E', 'G', 'B'],
      source: 'Diatonic',
      note: 'bright tonic',
    });
  });

  it('creates parser-valid default chords for each group', () => {
    expect(createDefaultChordForGroup('major').name).toBe('C');
    expect(createDefaultChordForGroup('minor').name).toBe('Am');
  });

  it('converts bundled defaults into a persisted custom config shape', () => {
    const result = buildChordGuideCustomConfigFromData(chordGuideData);

    expect(result.major.T[0].name).toBe(chordGuideData.ionian.T[0].name);
    expect(result.minor.D[0].name).toBe(chordGuideData.aeolian.D[0].name);
  });

  it('prefers persisted custom config over bundled defaults for runtime data', () => {
    const custom = buildChordGuideCustomConfigFromData(chordGuideData);
    custom.major.T = [createDefaultChordForGroup('major')];

    const result = buildChordGuideDataFromDefaultsAndConfig(chordGuideData, custom);

    expect(result.ionian.T).toHaveLength(1);
    expect(result.ionian.T[0].name).toBe('C');
    expect(result.aeolian.T[0].name).toBe(chordGuideData.aeolian.T[0].name);
  });
});
