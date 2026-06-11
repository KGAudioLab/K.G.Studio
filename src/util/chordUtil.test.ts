import { describe, expect, it } from 'vitest';
import { buildChordSymbol, formatChordSymbolForDisplay, getChordMidiPitches, getChordPitchClasses, parseChordSymbol } from './chordUtil';
import { buildChordRegionImportPlan, convertChordSymbolToMidiPitches } from './chordRegionImportUtil';
import { KGChordRegion } from '../core/region/KGChordRegion';

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

  it('parses diminished seventh chords as a distinct canonical shape', () => {
    const parsed = parseChordSymbol('G#dim7');

    expect(parsed).not.toBeNull();
    expect(parsed?.root).toBe('G#');
    expect(parsed?.quality).toBe('dim');
    expect(parsed?.extensions).toContain('dim7');
    expect(parsed?.symbol).toBe('G#dim7');
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

  it('canonicalizes extended seventh-family chords using standard shorthand', () => {
    expect(parseChordSymbol('Am9')?.symbol).toBe('Am9');
    expect(parseChordSymbol('Dm11')?.symbol).toBe('Dm11');
    expect(parseChordSymbol('G13')?.symbol).toBe('G13');
    expect(parseChordSymbol('Bbmaj9')?.symbol).toBe('Bbmaj9');
    expect(parseChordSymbol('E7sus4')?.symbol).toBe('E7sus4');
    expect(buildChordSymbol({
      root: 'C',
      quality: 'sus4',
      extensions: ['9'],
    })).toBe('Csus4add9');
    expect(buildChordSymbol({
      root: 'E',
      quality: 'sus4',
      extensions: ['7'],
    })).toBe('E7sus4');
  });

  it('rejects unsupported symbols deterministically', () => {
    expect(parseChordSymbol('C/E')).toBeNull();
    expect(parseChordSymbol('not-a-chord')).toBeNull();
  });

  it('derives stable pitch classes and midi pitches from the stored symbol', () => {
    expect(getChordPitchClasses('Bm7b5')).toEqual([11, 2, 5, 9]);
    expect(getChordMidiPitches('Bm7b5', 59)).toEqual([59, 62, 65, 69]);
    expect(getChordMidiPitches('Ddim7', 50)).toEqual([50, 53, 56, 59]);
  });

  it('formats the preview using standard chord display conventions', () => {
    expect(formatChordSymbolForDisplay('Bm7b5')).toBe('Bm7(♭5)');
    expect(formatChordSymbolForDisplay('Am9')).toBe('Am9');
    expect(formatChordSymbolForDisplay('Dm11')).toBe('Dm11');
    expect(formatChordSymbolForDisplay('G13')).toBe('G13');
    expect(formatChordSymbolForDisplay('Bbmaj9')).toBe('B♭maj9');
    expect(formatChordSymbolForDisplay('Bbmaj7#11')).toBe('B♭maj7(♯11)');
    expect(formatChordSymbolForDisplay('G#dim7')).toBe('G♯dim7');
  });

  it('maps C-root chords into the C4-C5 range', () => {
    expect(convertChordSymbolToMidiPitches('C')).toEqual([48, 60, 64, 67]);
  });

  it('maps F-root chords down to the lower octave range', () => {
    expect(convertChordSymbolToMidiPitches('F')).toEqual([41, 53, 57, 60]);
  });

  it('maps common progression chords into the expected octave ranges', () => {
    expect(convertChordSymbolToMidiPitches('Am')).toEqual([45, 57, 60, 64]);
    expect(convertChordSymbolToMidiPitches('Dm')).toEqual([50, 62, 65, 69]);
    expect(convertChordSymbolToMidiPitches('E7')).toEqual([52, 64, 68, 71, 74]);
    expect(convertChordSymbolToMidiPitches('E7sus4')).toEqual([52, 64, 69, 71, 74]);
    expect(convertChordSymbolToMidiPitches('Bm7b5')).toEqual([47, 59, 62, 65, 69]);
  });

  it('maps extended chords into MIDI pitches without relying on tonal round-tripping', () => {
    expect(convertChordSymbolToMidiPitches('Am9')).toEqual([45, 57, 60, 64, 67, 71]);
    expect(convertChordSymbolToMidiPitches('Dm9')).toEqual([50, 62, 65, 69, 72, 76]);
    expect(convertChordSymbolToMidiPitches('G13')).toEqual([43, 55, 59, 62, 65, 69, 76]);
    expect(convertChordSymbolToMidiPitches('Bbmaj9')).toEqual([46, 58, 62, 65, 69, 72]);
  });

  it('builds a multi-region import plan using timeline-relative note placement', () => {
    const chordA = new KGChordRegion('chord-1', 'global-chord', 3, 'C', 8, 4);
    const chordB = new KGChordRegion('chord-2', 'global-chord', 3, 'F', 12, 2);
    const result = buildChordRegionImportPlan([chordB, chordA]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.startBeat).toBe(8);
    expect(result.plan.lengthInBeats).toBe(6);
    expect(result.plan.sourceRegionIds).toEqual(['chord-1', 'chord-2']);
    expect(result.plan.notes).toEqual([
      { startBeat: 0, endBeat: 4, pitch: 48, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 60, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 64, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 67, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 41, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 53, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 57, velocity: 127 },
      { startBeat: 4, endBeat: 6, pitch: 60, velocity: 127 },
    ]);
  });

  it('builds an import plan for a more complex chord progression', () => {
    const chordA = new KGChordRegion('chord-1', 'global-chord', 3, 'Am', 0, 4);
    const chordB = new KGChordRegion('chord-2', 'global-chord', 3, 'Dm', 4, 4);
    const chordC = new KGChordRegion('chord-3', 'global-chord', 3, 'E7', 8, 4);
    const chordD = new KGChordRegion('chord-4', 'global-chord', 3, 'Bm7b5', 12, 4);
    const result = buildChordRegionImportPlan([chordD, chordB, chordA, chordC]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.startBeat).toBe(0);
    expect(result.plan.lengthInBeats).toBe(16);
    expect(result.plan.sourceRegionIds).toEqual(['chord-1', 'chord-2', 'chord-3', 'chord-4']);
    expect(result.plan.notes).toEqual([
      { startBeat: 0, endBeat: 4, pitch: 45, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 57, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 60, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 64, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 50, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 62, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 65, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 69, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 52, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 64, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 68, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 71, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 74, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 47, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 59, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 62, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 65, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 69, velocity: 127 },
    ]);
  });

  it('builds an import plan for a suspended dominant chord', () => {
    const chord = new KGChordRegion('chord-1', 'global-chord', 3, 'E7sus4', 0, 4);
    const result = buildChordRegionImportPlan([chord]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.sourceRegionIds).toEqual(['chord-1']);
    expect(result.plan.notes).toEqual([
      { startBeat: 0, endBeat: 4, pitch: 52, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 64, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 69, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 71, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 74, velocity: 127 },
    ]);
  });

  it('builds an import plan for extended chord progressions', () => {
    const chordA = new KGChordRegion('chord-1', 'global-chord', 3, 'Am9', 0, 4);
    const chordB = new KGChordRegion('chord-2', 'global-chord', 3, 'Dm9', 4, 4);
    const chordC = new KGChordRegion('chord-3', 'global-chord', 3, 'G13', 8, 4);
    const chordD = new KGChordRegion('chord-4', 'global-chord', 3, 'Bbmaj9', 12, 4);
    const result = buildChordRegionImportPlan([chordD, chordB, chordA, chordC]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.plan.sourceRegionIds).toEqual(['chord-1', 'chord-2', 'chord-3', 'chord-4']);
    expect(result.plan.lengthInBeats).toBe(16);
    expect(result.plan.notes).toEqual([
      { startBeat: 0, endBeat: 4, pitch: 45, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 57, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 60, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 64, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 67, velocity: 127 },
      { startBeat: 0, endBeat: 4, pitch: 71, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 50, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 62, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 65, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 69, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 72, velocity: 127 },
      { startBeat: 4, endBeat: 8, pitch: 76, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 43, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 55, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 59, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 62, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 65, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 69, velocity: 127 },
      { startBeat: 8, endBeat: 12, pitch: 76, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 46, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 58, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 62, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 65, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 69, velocity: 127 },
      { startBeat: 12, endBeat: 16, pitch: 72, velocity: 127 },
    ]);
  });

  it('returns structured failure metadata for unsupported symbols', () => {
    const badChord = new KGChordRegion('chord-1', 'global-chord', 3, 'not-a-chord', 0, 4);
    const result = buildChordRegionImportPlan([badChord]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toContain('Unable to import chord');
  });
});
