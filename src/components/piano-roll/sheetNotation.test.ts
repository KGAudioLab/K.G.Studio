import { describe, expect, it } from 'vitest';
import { createMockMidiNote, createMockMidiRegion } from '../../test/utils/mock-data';
import {
  buildSheetMeasureMetrics,
  getSheetBeatAtPixel,
  buildSheetMeasureModels,
  getSheetPlayheadPixel,
  getSheetKeySignatureChangeModifierWidth,
  getSheetQuantizationOptions,
  isDrumInstrument,
  parseSheetQuantization,
  projectKeySignatureToVexFlow,
  resolveDurationSpec,
  resolveSheetClef,
} from './sheetNotation';
import { quarterNotesToTicks } from '../../core/timing';

const q = quarterNotesToTicks;

describe('sheetNotation', () => {
  it('parses all supported quantization values', () => {
    getSheetQuantizationOptions().forEach((value) => {
      const parsed = parseSheetQuantization(value);
      expect(parsed.raw).toBe(value);
      expect(parsed.stepTicks).toBeGreaterThan(0);
    });
  });

  it('splits notes that cross barlines and inserts rests', () => {
    const region = createMockMidiRegion({
      length: 8,
      notes: [
        createMockMidiNote({ startTick: 0, endTick: 5, pitch: 60 }),
        createMockMidiNote({ startTick: 6, endTick: 7, pitch: 64, id: 'note-2' }),
      ],
    });

    const measures = buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
    });

    expect(measures).toHaveLength(2);
    expect(measures[0].events.some(event => event.tieEnd)).toBe(true);
    expect(measures[1].events.some(event => event.tieStart)).toBe(true);
    expect(measures[1].events.some(event => event.isRest)).toBe(true);
  });

  it('selects clef from note range and falls back for drum instruments', () => {
    expect(resolveSheetClef([createMockMidiNote({ pitch: 76 })], 'acoustic_grand_piano')).toBe('treble');
    expect(resolveSheetClef([createMockMidiNote({ pitch: 40 })], 'acoustic_grand_piano')).toBe('bass');
    expect(isDrumInstrument('standard')).toBe(true);
    expect(resolveSheetClef([createMockMidiNote({ pitch: 38 })], 'standard', false)).toBe('treble');
  });

  it('maps playhead position through variable-width bars', () => {
    const metrics = buildSheetMeasureMetrics([
      { barIndex: 0, absoluteBarIndex: 0, startTick: 0, endTick: 4, keySignature: 'C major', events: [] },
      { barIndex: 1, absoluteBarIndex: 1, startTick: 4, endTick: 8, keySignature: 'C major', events: [] },
    ], [120, 240]);

    expect(getSheetPlayheadPixel(0, metrics)).toBe(0);
    expect(getSheetPlayheadPixel(2, metrics)).toBe(60);
    expect(getSheetPlayheadPixel(5, metrics)).toBe(180);
    expect(getSheetPlayheadPixel(8, metrics)).toBe(360);
  });

  it('supports dotted durations used by sheet display', () => {
    expect(resolveDurationSpec(q(1.5), false)).toEqual({ duration: 'q', dots: 1 });
    expect(resolveDurationSpec(q(1.5), true)).toEqual({ duration: 'qr', dots: 1 });
    expect(resolveDurationSpec(q(3), false)).toEqual({ duration: 'h', dots: 1 });
  });

  it('maps project key signatures to vexflow key specs', () => {
    expect(projectKeySignatureToVexFlow('C major')).toBe('C');
    expect(projectKeySignatureToVexFlow('C# minor')).toBe('C#m');
    expect(projectKeySignatureToVexFlow('F# major')).toBe('F#');
  });

  it('spells MIDI pitches with flats or sharps according to the effective key signature', () => {
    const region = createMockMidiRegion({
      length: 4,
      notes: [61, 63, 66, 68, 69, 70].map((pitch, index) => createMockMidiNote({
        id: `note-${index}`,
        pitch,
        startTick: 0,
        endTick: 1,
      })),
    });

    const buildKeys = (keySignature: 'F minor' | 'C# minor') => buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
      defaultKeySignature: keySignature,
    })[0].events.find(event => !event.isRest)?.keys;

    expect(buildKeys('F minor')).toEqual(['db/4', 'eb/4', 'gb/4', 'ab/4', 'a/4', 'bb/4']);
    expect(buildKeys('C# minor')).toEqual(['c#/4', 'd#/4', 'f#/4', 'g#/4', 'a/4', 'a#/4']);
  });

  it('respells notes per measure when the effective key signature changes', () => {
    const region = createMockMidiRegion({
      length: 8,
      notes: [
        createMockMidiNote({ id: 'sharp-note', pitch: 68, startTick: 0, endTick: 1 }),
        createMockMidiNote({ id: 'flat-note', pitch: 68, startTick: 4, endTick: 5 }),
      ],
    });

    const measures = buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
      defaultKeySignature: 'C# minor',
      resolveKeySignatureAtBar: barIndex => (barIndex === 0 ? 'C# minor' : 'F minor'),
    });

    expect(measures[0].events.find(event => !event.isRest)?.keys).toEqual(['g#/4']);
    expect(measures[1].events.find(event => !event.isRest)?.keys).toEqual(['ab/4']);
  });

  it('estimates extra width for cancelled naturals and new accidentals on key changes', () => {
    expect(getSheetKeySignatureChangeModifierWidth('C major', 'G major')).toBeGreaterThan(0);
    expect(getSheetKeySignatureChangeModifierWidth('G major', 'C major')).toBeGreaterThan(0);
    expect(getSheetKeySignatureChangeModifierWidth('D major', 'G major')).toBeGreaterThan(0);
    expect(getSheetKeySignatureChangeModifierWidth('C major', 'C major')).toBe(0);
  });

  it('keeps bar-aligned quarter notes in the correct measure model', () => {
    const region = createMockMidiRegion({
      length: 8,
      notes: [
        createMockMidiNote({ startTick: 0, endTick: 1, pitch: 64, id: 'n1' }),
        createMockMidiNote({ startTick: 1, endTick: 2, pitch: 64, id: 'n2' }),
        createMockMidiNote({ startTick: 2, endTick: 3, pitch: 65, id: 'n3' }),
        createMockMidiNote({ startTick: 3, endTick: 4, pitch: 67, id: 'n4' }),
        createMockMidiNote({ startTick: 4, endTick: 5, pitch: 67, id: 'n5' }),
      ],
    });

    const measures = buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
    });

    expect(measures[0].events.filter(event => !event.isRest).map(event => event.startTick)).toEqual([q(0), q(1), q(2), q(3)]);
    expect(measures[1].events.filter(event => !event.isRest).map(event => event.startTick)).toEqual([q(4)]);
  });

  it('builds a full-track sheet timeline with rests across empty bars and gaps', () => {
    const firstRegion = createMockMidiRegion({
      id: 'region-a',
      startTick: 4,
      length: 4,
      notes: [createMockMidiNote({ id: 'a1', startTick: 0, endTick: 1, pitch: 60 })],
    });
    const secondRegion = createMockMidiRegion({
      id: 'region-b',
      startTick: 12,
      length: 4,
      notes: [createMockMidiNote({ id: 'b1', startTick: 0, endTick: 1, pitch: 64 })],
    });

    const measures = buildSheetMeasureModels({
      scope: 'track',
      region: firstRegion,
      regions: [secondRegion, firstRegion],
      projectMaxBars: 6,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
    });

    expect(measures).toHaveLength(6);
    expect(measures[0].startTick).toBe(0);
    expect(measures[5].endTick).toBe(q(24));
    expect(measures[0].events.every(event => event.isRest)).toBe(true);
    expect(measures[1].events.some(event => !event.isRest && event.startTick === q(4))).toBe(true);
    expect(measures[2].events.every(event => event.isRest)).toBe(true);
    expect(measures[3].events.some(event => !event.isRest && event.startTick === q(12))).toBe(true);
    expect(measures[4].events.every(event => event.isRest)).toBe(true);
    expect(measures[5].events.every(event => event.isRest)).toBe(true);
  });

  it('maps absolute track beats through sheet metrics for full-track mode', () => {
    const metrics = buildSheetMeasureMetrics([
      { barIndex: 0, absoluteBarIndex: 0, startTick: 0, endTick: 4, keySignature: 'C major', events: [] },
      { barIndex: 1, absoluteBarIndex: 1, startTick: 4, endTick: 8, keySignature: 'C major', events: [] },
    ], [120, 240]);

    expect(getSheetPlayheadPixel(5, metrics)).toBe(180);
    expect(getSheetBeatAtPixel(180, metrics)).toBe(5);
  });

  it('attaches effective key signatures to sheet measures', () => {
    const region = createMockMidiRegion({
      startTick: 4,
      length: 12,
      notes: [createMockMidiNote({ startTick: 0, endTick: 1, pitch: 60 })],
    });

    const measures = buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
      defaultKeySignature: 'C major',
      resolveKeySignatureAtBar: (barIndex) => (barIndex >= 2 ? 'G major' : 'C major'),
    });

    expect(measures.map((measure) => measure.absoluteBarIndex)).toEqual([1, 2, 3]);
    expect(measures.map((measure) => measure.keySignature)).toEqual(['C major', 'G major', 'G major']);
  });
});
