import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { isPercussionInstrument } from '../../core/instruments/instrumentResolver';
import type { KeySignature } from '../../core/KGProject';
import type { KGMidiNote } from '../../core/midi/KGMidiNote';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import type { InstrumentType } from '../../core/track/KGMidiTrack';
import type {
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
  scope?: 'region' | 'track';
  region: KGMidiRegion;
  regions?: KGMidiRegion[];
  projectMaxBars?: number;
  timeSignature: { numerator: number; denominator: number };
  quantization: SheetQuantization;
  defaultKeySignature?: KeySignature;
  resolveKeySignatureAtBar?: (barIndex: number) => KeySignature;
}

interface WorkingEvent {
  midiPitches: number[];
  startBeat: number;
  endBeat: number;
  isRest: boolean;
}

interface SplitWorkingEvent extends WorkingEvent {
  tieStart: boolean;
  tieEnd: boolean;
}

interface NormalizedNoteInput {
  pitch: number;
  startBeat: number;
  endBeat: number;
}

export function getSheetQuantizationOptions(): string[] {
  return [...SHEET_QUANTIZATION_OPTIONS];
}

export function projectKeySignatureToVexFlow(keySignature: KeySignature): string {
  const [tonic, quality] = keySignature.split(' ');
  return quality === 'minor' ? `${tonic}m` : tonic;
}

export function getSheetKeySignatureChangeModifierWidth(
  keySignature: KeySignature,
  previousKeySignature: KeySignature | null
): number {
  if (!previousKeySignature || previousKeySignature === keySignature) {
    return 0;
  }

  const currentEntry = KEY_SIGNATURE_MAP[keySignature];
  const previousEntry = KEY_SIGNATURE_MAP[previousKeySignature];
  const currentCount = currentEntry.accidentals.length;
  const previousCount = previousEntry.accidentals.length;
  const differentTypes = (
    (currentEntry.sharps > 0 && previousEntry.flats > 0) ||
    (currentEntry.flats > 0 && previousEntry.sharps > 0)
  );
  const cancelledNaturals = differentTypes
    ? previousCount
    : Math.max(0, previousCount - currentCount);
  const glyphCount = cancelledNaturals + currentCount;

  // Roughly matches the added horizontal space VexFlow needs for
  // naturals followed by the new key signature accidentals.
  return 24 + glyphCount * 12;
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
  return key === 'standard' || isPercussionInstrument(key);
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

export function buildSheetMeasureMetrics(measures: SheetMeasureModel[], widths: number[]): SheetMeasureMetric[] {
  let leftPx = 0;
  return measures.map((measure, index) => {
    const widthPx = widths[index] ?? 0;
    const metric: SheetMeasureMetric = {
      barIndex: measure.barIndex,
      startBeat: measure.startBeat,
      endBeat: measure.endBeat,
      leftPx,
      widthPx,
    };
    leftPx += widthPx;
    return metric;
  });
}

export function getSheetPlayheadPixel(
  sheetBeat: number,
  metrics: SheetMeasureMetric[]
): number {
  if (metrics.length === 0) {
    return 0;
  }

  if (sheetBeat <= metrics[0].startBeat) {
    return metrics[0].leftPx;
  }

  const lastMetric = metrics[metrics.length - 1];
  if (sheetBeat >= lastMetric.endBeat) {
    return lastMetric.leftPx + lastMetric.widthPx;
  }

  const activeMetric = metrics.find(metric => sheetBeat >= metric.startBeat && sheetBeat < metric.endBeat);
  if (!activeMetric) {
    return 0;
  }

  const span = Math.max(activeMetric.endBeat - activeMetric.startBeat, EPSILON);
  const progress = (sheetBeat - activeMetric.startBeat) / span;
  return activeMetric.leftPx + activeMetric.widthPx * progress;
}

export function getSheetBeatAtPixel(
  pixel: number,
  metrics: SheetMeasureMetric[]
): number {
  if (metrics.length === 0) {
    return 0;
  }

  const firstMetric = metrics[0];
  if (pixel <= firstMetric.leftPx) {
    return firstMetric.startBeat;
  }

  const lastMetric = metrics[metrics.length - 1];
  if (pixel >= lastMetric.leftPx + lastMetric.widthPx) {
    return lastMetric.endBeat;
  }

  const activeMetric = metrics.find(metric => pixel >= metric.leftPx && pixel < metric.leftPx + metric.widthPx);
  if (!activeMetric) {
    return lastMetric.endBeat;
  }

  const progress = activeMetric.widthPx > 0 ? (pixel - activeMetric.leftPx) / activeMetric.widthPx : 0;
  return activeMetric.startBeat + progress * (activeMetric.endBeat - activeMetric.startBeat);
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
  scope = 'region',
  region,
  regions = [region],
  projectMaxBars,
  timeSignature,
  quantization,
  defaultKeySignature = 'C major',
  resolveKeySignatureAtBar,
}: BuildSheetNotationOptions): SheetMeasureModel[] {
  const beatsPerBar = timeSignature.numerator;
  const isTrackScope = scope === 'track';
  const timelineStartBeat = isTrackScope ? 0 : 0;
  const regionStartBar = Math.floor(region.getStartFromBeat() / beatsPerBar);
  const measureCount = isTrackScope
    ? Math.max(1, projectMaxBars ?? 1)
    : Math.max(1, Math.ceil(region.getLength() / beatsPerBar));
  const measureEndBeat = isTrackScope
    ? measureCount * beatsPerBar
    : measureCount * beatsPerBar;
  const noteInputs = isTrackScope
    ? collectTrackScopeNotes(regions)
    : region.getNotes().map(note => ({
        pitch: note.getPitch(),
        startBeat: note.getStartBeat(),
        endBeat: note.getEndBeat(),
      }));
  const workingEvents = normalizeNotes(noteInputs, quantization.stepBeats, measureEndBeat);
  const withRests = insertRests(workingEvents, measureEndBeat);
  const splitEvents = splitAcrossBars(withRests, beatsPerBar);

  const measures: SheetMeasureModel[] = Array.from({ length: measureCount }, (_, barIndex) => ({
    barIndex,
    absoluteBarIndex: isTrackScope ? barIndex : regionStartBar + barIndex,
    startBeat: timelineStartBeat + barIndex * beatsPerBar,
    endBeat: timelineStartBeat + (barIndex + 1) * beatsPerBar,
    keySignature: resolveKeySignatureAtBar?.(isTrackScope ? barIndex : regionStartBar + barIndex) ?? defaultKeySignature,
    events: [],
  }));

  splitEvents.forEach(event => {
    const barIndex = Math.min(measures.length - 1, Math.max(0, Math.floor(event.startBeat / beatsPerBar)));
    const measure = measures[barIndex];
    measure.events.push({
      keys: event.isRest
        ? ['b/4']
        : event.midiPitches.map(pitch => midiPitchToVexKey(pitch, measure.keySignature)),
      midiPitches: [...event.midiPitches],
      startBeat: event.startBeat,
      endBeat: event.endBeat,
      isRest: event.isRest,
      tieStart: event.tieStart,
      tieEnd: event.tieEnd,
    });
  });

  measures.forEach((measure) => {
    if (measure.events.length === 0) {
      measure.events.push({
        keys: ['b/4'],
        midiPitches: [],
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

function normalizeNotes(notes: NormalizedNoteInput[], stepBeats: number, measureEndBeat: number): WorkingEvent[] {
  const clippedNotes = notes
    .map(note => ({
      midiPitches: [note.pitch],
      startBeat: quantizeBeat(note.startBeat, stepBeats),
      endBeat: quantizeBeat(note.endBeat, stepBeats),
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
      return a.midiPitches[0] - b.midiPitches[0];
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
      previous.midiPitches.push(...note.midiPitches);
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

function collectTrackScopeNotes(regions: KGMidiRegion[]): NormalizedNoteInput[] {
  return [...regions]
    .sort((left, right) => {
      if (left.getStartFromBeat() !== right.getStartFromBeat()) {
        return left.getStartFromBeat() - right.getStartFromBeat();
      }

      return left.getId().localeCompare(right.getId());
    })
    .flatMap(region => {
      const regionStart = region.getStartFromBeat();
      // Overlapping regions are flattened in deterministic start-beat/id order so
      // the existing note normalization path can resolve collisions consistently.
      return region.getNotes().map(note => ({
        pitch: note.getPitch(),
        startBeat: regionStart + note.getStartBeat(),
        endBeat: regionStart + note.getEndBeat(),
      }));
    });
}

function insertRests(events: WorkingEvent[], measureEndBeat: number): WorkingEvent[] {
  if (events.length === 0) {
    return [{ midiPitches: [], startBeat: 0, endBeat: measureEndBeat, isRest: true }];
  }

  const result: WorkingEvent[] = [];
  let cursorBeat = 0;

  for (const event of events) {
    if (event.startBeat > cursorBeat + EPSILON) {
      result.push({
        midiPitches: [],
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
      midiPitches: [],
      startBeat: cursorBeat,
      endBeat: measureEndBeat,
      isRest: true,
    });
  }

  return result;
}

function splitAcrossBars(events: WorkingEvent[], beatsPerBar: number): SplitWorkingEvent[] {
  const result: SplitWorkingEvent[] = [];

  for (const event of events) {
    let segmentStart = event.startBeat;
    const eventEnd = event.endBeat;

    while (segmentStart < eventEnd - EPSILON) {
      const currentBar = Math.floor(segmentStart / beatsPerBar);
      const barEnd = (currentBar + 1) * beatsPerBar;
      const segmentEnd = Math.min(eventEnd, barEnd);

      result.push({
        midiPitches: [...event.midiPitches],
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

function midiPitchToVexKey(pitch: number, keySignature: KeySignature): string {
  const semitone = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const names = KEY_SIGNATURE_MAP[keySignature].flats > 0
    ? ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
    : ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  return `${names[semitone]}/${octave}`;
}
