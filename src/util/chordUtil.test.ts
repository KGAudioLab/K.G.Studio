import { describe, expect, it } from 'vitest';
import { buildChordSymbol, formatChordSymbolForDisplay, getChordMidiPitches, getChordPitchClasses, parseChordSymbol } from './chordUtil';

describe('chordUtil', () => {
  it('parses half-diminished chords into the popup descriptor shape', () => {
    const parsed = parseChordSymbol('Bm7b5');

    expect(parsed).not.toBeNull();
    expect(parsed?.root).toBe('B');
    expect(parsed?.quality).toBe('dim');
    expect(parsed?.extensions).toContain('b5');
    expect(parsed?.extensions).toContain('7');
    expect(parsed?.symbol).toBe('Bm7b5');
  });

  it('preserves enharmonic root spelling in the canonical symbol', () => {
    expect(buildChordSymbol({
      root: 'Bb',
      quality: 'maj',
      extensions: ['7'],
    })).toBe('Bb7');

    expect(buildChordSymbol({
      root: 'A#',
      quality: 'maj',
      extensions: ['7'],
    })).toBe('A#7');
  });

  it('rejects unsupported symbols deterministically', () => {
    expect(parseChordSymbol('C/E')).toBeNull();
    expect(parseChordSymbol('not-a-chord')).toBeNull();
  });

  it('derives stable pitch classes and midi pitches from the stored symbol', () => {
    expect(getChordPitchClasses('Bm7b5')).toEqual([11, 2, 5, 9]);
    expect(getChordMidiPitches('Bm7b5', 59)).toEqual([59, 62, 65, 69]);
  });

  it('formats the preview using standard chord display conventions', () => {
    expect(formatChordSymbolForDisplay('Bm7b5')).toBe('Bm7(♭5)');
    expect(formatChordSymbolForDisplay('Bbmaj7#11')).toBe('B♭maj7(♯11)');
  });
});
