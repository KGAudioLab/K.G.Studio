import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import type { KeySignature } from '../../core/KGProject';
import type { KGMidiNote } from '../../core/midi/KGMidiNote';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import type { InstrumentType } from '../../core/track/KGMidiTrack';
import type {
  SheetDisplayEvent,
  SheetMeasureMetric,
  SheetMeasureModel,
  SheetQuantization,
} from './sheetNotationTypes';

const SHEET_QUANTIZATION_OPTIONS = [
  '4', '4,3', '4,6', '4,12',
  '8', '8,6', '8,12', '8,24',
  '16', '16,12', '16,24', '16,48',
  '32', '32,24', '32,48', '32,96',
  '64', '64,48', '64,96', '64,192',
  '128', '128,96', '128,192', '128,384',
] as const;

const EPSILON = 1e-6;

export type SheetClef = 'treble' | 'bass' | 'percussion';

export interface BuildSheetNotationOptions {
  region: KGMidiRegion;
  timeSignature: { numerator: number; denominator: number };
  quantization: SheetQuantization;
}

interface WorkingEvent {
  keys: string[];
  startBeat: number;
  endBeat: number;
  isRest: boolean;
}

export function getSheetQuantizationOptions(): string[] {
  return [...SHEET_QUANTIZATION_OPTIONS];
}

export function projectKeySignatureToVexFlow(keySignature: KeySignature): string {
  const [tonic, quality] = keySignature.split(' ');
  return quality === 'minor' ? `${tonic}m` : tonic;
}

export function parseSheetQuantization(value: string): SheetQuantization {
  const [primaryText, subdivisionText] = value.split(',');
  const primary = Number.parseInt(primaryText, 10);
  const subdivision = Number.parseInt(subdivisionText ?? primaryText, 10);

  if (!Number.isFinite(primary) || primary <= 0 || !Number.isFinite(subdivision) || subdivision <= 0) {
    throw new Error(`Invalid sheet quantization value: ${value}`);
  }

  return {
    raw: value,
    primary,
    subdivision,
    stepBeats: 4 / subdivision,
  };
}

export function isDrumInstrument(instrument: InstrumentType): boolean {
  const key = String(instrument);
  return key === 'standard' || FLUIDR3_INSTRUMENT_MAP[key]?.group === 'PERCUSSION_KIT';
}

export function resolveSheetClef(
  notes: KGMidiNote[],
  instrument: InstrumentType,
  supportsPercussion = true
): SheetClef {
  if (isDrumInstrument(instrument)) {
    return supportsPercussion ? 'percussion' : 'treble';
  }

  if (notes.length === 0) {
    return 'treble';
  }

  const averagePitch = notes.reduce((sum, note) => sum + note.getPitch(), 0) / notes.length;
  return averagePitch >= 60 ? 'treble' : 'bass';
}

export function buildSheetMeasureMetrics(widths: number[], beatsPerBar: number): SheetMeasureMetric[] {
  let leftPx = 0;
  return widths.map((widthPx, index) => {
    const metric: SheetMeasureMetric = {
      barIndex: index,
      startBeat: index * beatsPerBar,
      endBeat: (index + 1) * beatsPerBar,
      leftPx,
      widthPx,
    };
    leftPx += widthPx;
    return metric;
  });
}

export function getSheetPlayheadPixel(
  regionRelativeBeat: number,
  metrics: SheetMeasureMetric[]
): number {
  if (metrics.length === 0) {
    return 0;
  }

  if (regionRelativeBeat <= metrics[0].startBeat) {
    return metrics[0].leftPx;
  }

  const lastMetric = metrics[metrics.length - 1];
  if (regionRelativeBeat >= lastMetric.endBeat) {
    return lastMetric.leftPx + lastMetric.widthPx;
  }

  const activeMetric = metrics.find(metric => regionRelativeBeat >= metric.startBeat && regionRelativeBeat < metric.endBeat);
  if (!activeMetric) {
    return 0;
  }

  const span = Math.max(activeMetric.endBeat - activeMetric.startBeat, EPSILON);
  const progress = (regionRelativeBeat - activeMetric.startBeat) / span;
  return activeMetric.leftPx + activeMetric.widthPx * progress;
}

export function resolveDurationSpec(durationBeats: number, isRest: boolean): { duration: string; dots: number } {
  const withRest = (value: string) => (isRest ? `${value}r` : value);
  const options = [
    { beats: 6, duration: 'w', dots: 1 },
    { beats: 4, duration: 'w', dots: 0 },
    { beats: 3, duration: 'h', dots: 1 },
    { beats: 2, duration: 'h', dots: 0 },
    { beats: 1.5, duration: 'q', dots: 1 },
    { beats: 1, duration: 'q', dots: 0 },
    { beats: 0.75, duration: '8', dots: 1 },
    { beats: 0.5, duration: '8', dots: 0 },
    { beats: 0.375, duration: '16', dots: 1 },
    { beats: 0.25, duration: '16', dots: 0 },
    { beats: 0.1875, duration: '32', dots: 1 },
    { beats: 0.125, duration: '32', dots: 0 },
    { beats: 0.09375, duration: '64', dots: 1 },
    { beats: 0.0625, duration: '64', dots: 0 },
  ];

  const match = options.find(option => Math.abs(durationBeats - option.beats) < EPSILON);
  if (match) {
    return { duration: withRest(match.duration), dots: match.dots };
  }

  if (durationBeats >= 4 - EPSILON) return { duration: withRest('w'), dots: 0 };
  if (durationBeats >= 2 - EPSILON) return { duration: withRest('h'), dots: 0 };
  if (durationBeats >= 1 - EPSILON) return { duration: withRest('q'), dots: 0 };
  if (durationBeats >= 0.5 - EPSILON) return { duration: withRest('8'), dots: 0 };
  if (durationBeats >= 0.25 - EPSILON) return { duration: withRest('16'), dots: 0 };
  if (durationBeats >= 0.125 - EPSILON) return { duration: withRest('32'), dots: 0 };
  return { duration: withRest('64'), dots: 0 };
}

export function buildSheetMeasureModels({
  region,
  timeSignature,
  quantization,
}: BuildSheetNotationOptions): SheetMeasureModel[] {
  const beatsPerBar = timeSignature.numerator;
  const measureCount = Math.max(1, Math.ceil(region.getLength() / beatsPerBar));
  const measureEndBeat = measureCount * beatsPerBar;
  const workingEvents = normalizeNotes(region.getNotes(), quantization.stepBeats, measureEndBeat);
  const withRests = insertRests(workingEvents, measureEndBeat);
  const splitEvents = splitAcrossBars(withRests, beatsPerBar);

  const measures: SheetMeasureModel[] = Array.from({ length: measureCount }, (_, barIndex) => ({
    barIndex,
    startBeat: barIndex * beatsPerBar,
    endBeat: (barIndex + 1) * beatsPerBar,
    events: [],
  }));

  splitEvents.forEach(event => {
    const barIndex = Math.min(measures.length - 1, Math.max(0, Math.floor(event.startBeat / beatsPerBar)));
    measures[barIndex].events.push(event);
  });

  measures.forEach((measure) => {
    if (measure.events.length === 0) {
      measure.events.push({
        keys: ['b/4'],
        startBeat: measure.startBeat,
        endBeat: measure.endBeat,
        isRest: true,
        tieStart: false,
        tieEnd: false,
      });
    }
  });

  return measures;
}

function normalizeNotes(notes: KGMidiNote[], stepBeats: number, measureEndBeat: number): WorkingEvent[] {
  const clippedNotes = notes
    .map(note => ({
      keys: [midiPitchToVexKey(note.getPitch())],
      startBeat: quantizeBeat(note.getStartBeat(), stepBeats),
      endBeat: quantizeBeat(note.getEndBeat(), stepBeats),
      isRest: false,
    }))
    .map(note => ({
      ...note,
      startBeat: clampBeat(note.startBeat, 0, measureEndBeat),
      endBeat: clampBeat(Math.max(note.endBeat, note.startBeat + stepBeats), 0, measureEndBeat),
    }))
    .filter(note => note.endBeat - note.startBeat > EPSILON)
    .sort((a, b) => {
      if (a.startBeat !== b.startBeat) return a.startBeat - b.startBeat;
      if (a.endBeat !== b.endBeat) return a.endBeat - b.endBeat;
      return a.keys[0].localeCompare(b.keys[0]);
    });

  const merged: WorkingEvent[] = [];

  for (const note of clippedNotes) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.isRest &&
      Math.abs(previous.startBeat - note.startBeat) < EPSILON &&
      Math.abs(previous.endBeat - note.endBeat) < EPSILON
    ) {
      previous.keys.push(...note.keys);
      continue;
    }

    merged.push(note);
  }

  for (let index = 0; index < merged.length - 1; index += 1) {
    const current = merged[index];
    const next = merged[index + 1];
    if (current.endBeat > next.startBeat + EPSILON) {
      current.endBeat = Math.max(current.startBeat + stepBeats, next.startBeat);
    }
  }

  return merged.filter(note => note.endBeat - note.startBeat > EPSILON);
}

function insertRests(events: WorkingEvent[], measureEndBeat: number): WorkingEvent[] {
  if (events.length === 0) {
    return [{ keys: ['b/4'], startBeat: 0, endBeat: measureEndBeat, isRest: true }];
  }

  const result: WorkingEvent[] = [];
  let cursorBeat = 0;

  for (const event of events) {
    if (event.startBeat > cursorBeat + EPSILON) {
      result.push({
        keys: ['b/4'],
        startBeat: cursorBeat,
        endBeat: event.startBeat,
        isRest: true,
      });
    }

    result.push(event);
    cursorBeat = event.endBeat;
  }

  if (cursorBeat < measureEndBeat - EPSILON) {
    result.push({
      keys: ['b/4'],
      startBeat: cursorBeat,
      endBeat: measureEndBeat,
      isRest: true,
    });
  }

  return result;
}

function splitAcrossBars(events: WorkingEvent[], beatsPerBar: number): SheetDisplayEvent[] {
  const result: SheetDisplayEvent[] = [];

  for (const event of events) {
    let segmentStart = event.startBeat;
    const eventEnd = event.endBeat;

    while (segmentStart < eventEnd - EPSILON) {
      const currentBar = Math.floor(segmentStart / beatsPerBar);
      const barEnd = (currentBar + 1) * beatsPerBar;
      const segmentEnd = Math.min(eventEnd, barEnd);

      result.push({
        keys: [...event.keys],
        startBeat: segmentStart,
        endBeat: segmentEnd,
        isRest: event.isRest,
        tieStart: !event.isRest && segmentStart > event.startBeat + EPSILON,
        tieEnd: !event.isRest && segmentEnd < eventEnd - EPSILON,
      });

      segmentStart = segmentEnd;
    }
  }

  return result;
}

function quantizeBeat(beat: number, stepBeats: number): number {
  return Math.round(beat / stepBeats) * stepBeats;
}

function clampBeat(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midiPitchToVexKey(pitch: number): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  return `${names[semitone]}/${octave}`;
}
