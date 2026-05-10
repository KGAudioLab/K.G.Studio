import { describe, expect, it } from 'vitest';
import { createMockMidiNote, createMockMidiRegion } from '../../test/utils/mock-data';
import {
  buildSheetMeasureMetrics,
  buildSheetMeasureModels,
  getSheetPlayheadPixel,
  getSheetQuantizationOptions,
  isDrumInstrument,
  parseSheetQuantization,
  projectKeySignatureToVexFlow,
  resolveDurationSpec,
  resolveSheetClef,
} from './sheetNotation';

describe('sheetNotation', () => {
  it('parses all supported quantization values', () => {
    getSheetQuantizationOptions().forEach((value) => {
      const parsed = parseSheetQuantization(value);
      expect(parsed.raw).toBe(value);
      expect(parsed.stepBeats).toBeGreaterThan(0);
    });
  });

  it('splits notes that cross barlines and inserts rests', () => {
    const region = createMockMidiRegion({
      length: 8,
      notes: [
        createMockMidiNote({ startBeat: 0, endBeat: 5, pitch: 60 }),
        createMockMidiNote({ startBeat: 6, endBeat: 7, pitch: 64, id: 'note-2' }),
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
    const metrics = buildSheetMeasureMetrics([120, 240], 4);

    expect(getSheetPlayheadPixel(0, metrics)).toBe(0);
    expect(getSheetPlayheadPixel(2, metrics)).toBe(60);
    expect(getSheetPlayheadPixel(5, metrics)).toBe(180);
    expect(getSheetPlayheadPixel(8, metrics)).toBe(360);
  });

  it('supports dotted durations used by sheet display', () => {
    expect(resolveDurationSpec(1.5, false)).toEqual({ duration: 'q', dots: 1 });
    expect(resolveDurationSpec(1.5, true)).toEqual({ duration: 'qr', dots: 1 });
    expect(resolveDurationSpec(3, false)).toEqual({ duration: 'h', dots: 1 });
  });

  it('maps project key signatures to vexflow key specs', () => {
    expect(projectKeySignatureToVexFlow('C major')).toBe('C');
    expect(projectKeySignatureToVexFlow('C# minor')).toBe('C#m');
    expect(projectKeySignatureToVexFlow('F# major')).toBe('F#');
  });

  it('keeps bar-aligned quarter notes in the correct measure model', () => {
    const region = createMockMidiRegion({
      length: 8,
      notes: [
        createMockMidiNote({ startBeat: 0, endBeat: 1, pitch: 64, id: 'n1' }),
        createMockMidiNote({ startBeat: 1, endBeat: 2, pitch: 64, id: 'n2' }),
        createMockMidiNote({ startBeat: 2, endBeat: 3, pitch: 65, id: 'n3' }),
        createMockMidiNote({ startBeat: 3, endBeat: 4, pitch: 67, id: 'n4' }),
        createMockMidiNote({ startBeat: 4, endBeat: 5, pitch: 67, id: 'n5' }),
      ],
    });

    const measures = buildSheetMeasureModels({
      region,
      timeSignature: { numerator: 4, denominator: 4 },
      quantization: parseSheetQuantization('16,48'),
    });

    expect(measures[0].events.filter(event => !event.isRest).map(event => event.startBeat)).toEqual([0, 1, 2, 3]);
    expect(measures[1].events.filter(event => !event.isRest).map(event => event.startBeat)).toEqual([4]);
  });
});
