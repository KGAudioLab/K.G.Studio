import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { isPercussionInstrument } from '../../core/instruments/instrumentResolver';
import type { KeySignature } from '../../core/KGProject';
import type { KGMidiNote } from '../../core/midi/KGMidiNote';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import type { InstrumentType } from '../../core/track/KGMidiTrack';
import { TICKS_PER_QUARTER, ticksPerBar } from '../../core/timing';
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
  startTick: number;
  endTick: number;
  isRest: boolean;
}

interface SplitWorkingEvent extends WorkingEvent {
  tieStart: boolean;
  tieEnd: boolean;
}

interface NormalizedNoteInput {
  pitch: number;
  startTick: number;
  endTick: number;
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
    stepTicks: Math.round((4 * 960) / subdivision),
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
      startTick: measure.startTick,
      endTick: measure.endTick,
      leftPx,
      widthPx,
    };
    leftPx += widthPx;
    return metric;
  });
}

export function getSheetPlayheadPixel(
  sheetTick: number,
  metrics: SheetMeasureMetric[]
): number {
  if (metrics.length === 0) {
    return 0;
  }

  if (sheetTick <= metrics[0].startTick) {
    return metrics[0].leftPx;
  }

  const lastMetric = metrics[metrics.length - 1];
  if (sheetTick >= lastMetric.endTick) {
    return lastMetric.leftPx + lastMetric.widthPx;
  }

  const activeMetric = metrics.find(metric => sheetTick >= metric.startTick && sheetTick < metric.endTick);
  if (!activeMetric) {
    return 0;
  }

  const span = Math.max(activeMetric.endTick - activeMetric.startTick, 1);
  const progress = (sheetTick - activeMetric.startTick) / span;
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
    return firstMetric.startTick;
  }

  const lastMetric = metrics[metrics.length - 1];
  if (pixel >= lastMetric.leftPx + lastMetric.widthPx) {
    return lastMetric.endTick;
  }

  const activeMetric = metrics.find(metric => pixel >= metric.leftPx && pixel < metric.leftPx + metric.widthPx);
  if (!activeMetric) {
    return lastMetric.endTick;
  }

  const progress = activeMetric.widthPx > 0 ? (pixel - activeMetric.leftPx) / activeMetric.widthPx : 0;
  return Math.round(activeMetric.startTick + progress * (activeMetric.endTick - activeMetric.startTick));
}

export function resolveDurationSpec(durationTicks: number, isRest: boolean): { duration: string; dots: number } {
  const withRest = (value: string) => (isRest ? `${value}r` : value);
  const options = [
    { ticks: 5760, duration: 'w', dots: 1 },
    { ticks: 3840, duration: 'w', dots: 0 },
    { ticks: 2880, duration: 'h', dots: 1 },
    { ticks: 1920, duration: 'h', dots: 0 },
    { ticks: 1440, duration: 'q', dots: 1 },
    { ticks: 960, duration: 'q', dots: 0 },
    { ticks: 720, duration: '8', dots: 1 },
    { ticks: 480, duration: '8', dots: 0 },
    { ticks: 360, duration: '16', dots: 1 },
    { ticks: 240, duration: '16', dots: 0 },
    { ticks: 180, duration: '32', dots: 1 },
    { ticks: 120, duration: '32', dots: 0 },
    { ticks: 90, duration: '64', dots: 1 },
    { ticks: 60, duration: '64', dots: 0 },
  ];

  const match = options.find(option => durationTicks === option.ticks);
  if (match) {
    return { duration: withRest(match.duration), dots: match.dots };
  }

  if (durationTicks >= 4 * TICKS_PER_QUARTER) return { duration: withRest('w'), dots: 0 };
  if (durationTicks >= 2 * TICKS_PER_QUARTER) return { duration: withRest('h'), dots: 0 };
  if (durationTicks >= TICKS_PER_QUARTER) return { duration: withRest('q'), dots: 0 };
  if (durationTicks >= TICKS_PER_QUARTER / 2) return { duration: withRest('8'), dots: 0 };
  if (durationTicks >= TICKS_PER_QUARTER / 4) return { duration: withRest('16'), dots: 0 };
  if (durationTicks >= TICKS_PER_QUARTER / 8) return { duration: withRest('32'), dots: 0 };
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
  const barTicks = ticksPerBar(timeSignature);
  const isTrackScope = scope === 'track';
  const timelineStartTick = isTrackScope ? 0 : 0;
  const regionStartBar = Math.floor(region.getStartTick() / barTicks);
  const measureCount = isTrackScope
    ? Math.max(1, projectMaxBars ?? 1)
    : Math.max(1, Math.ceil(region.getLengthTicks() / barTicks));
  const measureEndTick = isTrackScope
    ? measureCount * barTicks
    : measureCount * barTicks;
  const noteInputs = isTrackScope
    ? collectTrackScopeNotes(regions)
    : region.getNotes().map(note => ({
        pitch: note.getPitch(),
        startTick: note.getStartTick(),
        endTick: note.getEndTick(),
      }));
  const workingEvents = normalizeNotes(noteInputs, quantization.stepTicks, measureEndTick);
  const withRests = insertRests(workingEvents, measureEndTick);
  const splitEvents = splitAcrossBars(withRests, barTicks);

  const measures: SheetMeasureModel[] = Array.from({ length: measureCount }, (_, barIndex) => ({
    barIndex,
    absoluteBarIndex: isTrackScope ? barIndex : regionStartBar + barIndex,
    startTick: timelineStartTick + barIndex * barTicks,
    endTick: timelineStartTick + (barIndex + 1) * barTicks,
    keySignature: resolveKeySignatureAtBar?.(isTrackScope ? barIndex : regionStartBar + barIndex) ?? defaultKeySignature,
    events: [],
  }));

  splitEvents.forEach(event => {
    const barIndex = Math.min(measures.length - 1, Math.max(0, Math.floor(event.startTick / barTicks)));
    const measure = measures[barIndex];
    measure.events.push({
      keys: event.isRest
        ? ['b/4']
        : event.midiPitches.map(pitch => midiPitchToVexKey(pitch, measure.keySignature)),
      midiPitches: [...event.midiPitches],
      startTick: event.startTick,
      endTick: event.endTick,
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
        startTick: measure.startTick,
        endTick: measure.endTick,
        isRest: true,
        tieStart: false,
        tieEnd: false,
      });
    }
  });

  return measures;
}

function normalizeNotes(notes: NormalizedNoteInput[], stepTicks: number, measureEndTick: number): WorkingEvent[] {
  const clippedNotes = notes
    .map(note => ({
      midiPitches: [note.pitch],
      startTick: quantizeTick(note.startTick, stepTicks),
      endTick: quantizeTick(note.endTick, stepTicks),
      isRest: false,
    }))
    .map(note => ({
      ...note,
      startTick: clampTick(note.startTick, 0, measureEndTick),
      endTick: clampTick(Math.max(note.endTick, note.startTick + stepTicks), 0, measureEndTick),
    }))
    .filter(note => note.endTick > note.startTick)
    .sort((a, b) => {
      if (a.startTick !== b.startTick) return a.startTick - b.startTick;
      if (a.endTick !== b.endTick) return a.endTick - b.endTick;
      return a.midiPitches[0] - b.midiPitches[0];
    });

  const merged: WorkingEvent[] = [];

  for (const note of clippedNotes) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.isRest &&
      previous.startTick === note.startTick &&
      previous.endTick === note.endTick
    ) {
      previous.midiPitches.push(...note.midiPitches);
      continue;
    }

    merged.push(note);
  }

  for (let index = 0; index < merged.length - 1; index += 1) {
    const current = merged[index];
    const next = merged[index + 1];
    if (current.endTick > next.startTick) {
      current.endTick = Math.max(current.startTick + stepTicks, next.startTick);
    }
  }

  return merged.filter(note => note.endTick > note.startTick);
}

function collectTrackScopeNotes(regions: KGMidiRegion[]): NormalizedNoteInput[] {
  return [...regions]
    .sort((left, right) => {
      if (left.getStartTick() !== right.getStartTick()) {
        return left.getStartTick() - right.getStartTick();
      }

      return left.getId().localeCompare(right.getId());
    })
    .flatMap(region => {
      const regionStart = region.getStartTick();
      // Overlapping regions are flattened in deterministic start-beat/id order so
      // the existing note normalization path can resolve collisions consistently.
      return region.getNotes().map(note => ({
        pitch: note.getPitch(),
        startTick: regionStart + note.getStartTick(),
        endTick: regionStart + note.getEndTick(),
      }));
    });
}

function insertRests(events: WorkingEvent[], measureEndTick: number): WorkingEvent[] {
  if (events.length === 0) {
    return [{ midiPitches: [], startTick: 0, endTick: measureEndTick, isRest: true }];
  }

  const result: WorkingEvent[] = [];
  let cursorTick = 0;

  for (const event of events) {
    if (event.startTick > cursorTick) {
      result.push({
        midiPitches: [],
        startTick: cursorTick,
        endTick: event.startTick,
        isRest: true,
      });
    }

    result.push(event);
    cursorTick = event.endTick;
  }

  if (cursorTick < measureEndTick) {
    result.push({
      midiPitches: [],
      startTick: cursorTick,
      endTick: measureEndTick,
      isRest: true,
    });
  }

  return result;
}

function splitAcrossBars(events: WorkingEvent[], ticksPerBar: number): SplitWorkingEvent[] {
  const result: SplitWorkingEvent[] = [];

  for (const event of events) {
    let segmentStart = event.startTick;
    const eventEnd = event.endTick;

    while (segmentStart < eventEnd) {
      const currentBar = Math.floor(segmentStart / ticksPerBar);
      const barEnd = (currentBar + 1) * ticksPerBar;
      const segmentEnd = Math.min(eventEnd, barEnd);

      result.push({
        midiPitches: [...event.midiPitches],
        startTick: segmentStart,
        endTick: segmentEnd,
        isRest: event.isRest,
        tieStart: !event.isRest && segmentStart > event.startTick,
        tieEnd: !event.isRest && segmentEnd < eventEnd,
      });

      segmentStart = segmentEnd;
    }
  }

  return result;
}

function quantizeTick(tick: number, stepTicks: number): number {
  return Math.round(tick / stepTicks) * stepTicks;
}

function clampTick(value: number, min: number, max: number): number {
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
