import type { TimeSignature } from '../types/projectTypes';

declare const timelineTickBrand: unique symbol;

/** Integer position on the musical timeline. One quarter note is 960 ticks. */
export type TimelineTick = number & { readonly [timelineTickBrand]: 'TimelineTick' };

export const TICKS_PER_QUARTER = 960;

export interface BarBeatTick {
  /** Zero-based bar index. */
  bar: number;
  /** Zero-based meter-beat index within the bar. */
  beat: number;
  /** Tick offset within the meter beat. */
  tick: number;
}

export interface TimelineTempoEvent {
  tick: TimelineTick;
  bpm: number;
}

export function toTimelineTick(value: number): TimelineTick {
  if (!Number.isFinite(value)) {
    throw new Error(`Timeline tick must be finite, received ${String(value)}.`);
  }
  return Math.round(value) as TimelineTick;
}

export function clampTimelineTick(value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): TimelineTick {
  return toTimelineTick(Math.max(minimum, Math.min(maximum, value)));
}

export function quarterNotesToTicks(quarterNotes: number): TimelineTick {
  return toTimelineTick(quarterNotes * TICKS_PER_QUARTER);
}

export function ticksToQuarterNotes(ticks: number): number {
  return ticks / TICKS_PER_QUARTER;
}

export function ticksPerMeterBeat(timeSignature: TimeSignature): TimelineTick {
  return toTimelineTick(TICKS_PER_QUARTER * (4 / timeSignature.denominator));
}

export function ticksPerBar(timeSignature: TimeSignature): TimelineTick {
  return toTimelineTick(timeSignature.numerator * ticksPerMeterBeat(timeSignature));
}

export function noteValueToTicks(denominator: number): TimelineTick {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error(`Note-value denominator must be greater than zero, received ${String(denominator)}.`);
  }
  return toTimelineTick((TICKS_PER_QUARTER * 4) / denominator);
}

export function barBeatTickToTicks(position: BarBeatTick, timeSignature: TimeSignature): TimelineTick {
  const beatTicks = ticksPerMeterBeat(timeSignature);
  return toTimelineTick((position.bar * ticksPerBar(timeSignature)) + (position.beat * beatTicks) + position.tick);
}

export function ticksToBarBeatTick(ticks: number, timeSignature: TimeSignature): BarBeatTick {
  const normalizedTicks = Math.max(0, Math.round(ticks));
  const barTicks = ticksPerBar(timeSignature);
  const beatTicks = ticksPerMeterBeat(timeSignature);
  const bar = Math.floor(normalizedTicks / barTicks);
  const withinBar = normalizedTicks - (bar * barTicks);
  const beat = Math.floor(withinBar / beatTicks);
  return {
    bar,
    beat,
    tick: withinBar - (beat * beatTicks),
  };
}

export function formatBarBeatTick(ticks: number, timeSignature: TimeSignature): string {
  const position = ticksToBarBeatTick(ticks, timeSignature);
  return `${position.bar + 1} ${position.beat + 1} ${position.tick}`;
}

export function parseBarBeatTick(raw: string, timeSignature: TimeSignature): TimelineTick | null {
  const match = raw.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (!match) return null;

  const bar = Number.parseInt(match[1], 10) - 1;
  const beat = Number.parseInt(match[2], 10) - 1;
  const tick = Number.parseInt(match[3], 10);
  const beatTicks = ticksPerMeterBeat(timeSignature);
  if (bar < 0 || beat < 0 || beat >= timeSignature.numerator || tick < 0 || tick >= beatTicks) {
    return null;
  }
  return barBeatTickToTicks({ bar, beat, tick }, timeSignature);
}

export function ticksToPixels(ticks: number, pixelsPerQuarter: number): number {
  return ticksToQuarterNotes(ticks) * pixelsPerQuarter;
}

export function pixelsToTicks(pixels: number, pixelsPerQuarter: number): TimelineTick {
  if (!Number.isFinite(pixelsPerQuarter) || pixelsPerQuarter <= 0) return toTimelineTick(0);
  return quarterNotesToTicks(pixels / pixelsPerQuarter);
}

function normalizeTempoEvents(events: TimelineTempoEvent[], defaultBpm: number): TimelineTempoEvent[] {
  const byTick = new Map<number, TimelineTempoEvent>();
  byTick.set(0, { tick: toTimelineTick(0), bpm: defaultBpm });
  for (const event of events) {
    if (event.tick < 0 || !Number.isFinite(event.bpm) || event.bpm <= 0) continue;
    byTick.set(event.tick, { tick: toTimelineTick(event.tick), bpm: event.bpm });
  }
  return [...byTick.values()].sort((left, right) => left.tick - right.tick);
}

export function tickToSeconds(tick: number, tempoEvents: TimelineTempoEvent[], defaultBpm: number): number {
  const targetTick = Math.max(0, Math.round(tick));
  const events = normalizeTempoEvents(tempoEvents, defaultBpm);
  let seconds = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const nextTick = events[index + 1]?.tick ?? targetTick;
    if (targetTick <= event.tick) break;
    const segmentEnd = Math.min(targetTick, nextTick);
    if (segmentEnd > event.tick) {
      seconds += ticksToQuarterNotes(segmentEnd - event.tick) * (60 / event.bpm);
    }
    if (targetTick <= nextTick) break;
  }

  return seconds;
}

export function secondsToTick(seconds: number, tempoEvents: TimelineTempoEvent[], defaultBpm: number): TimelineTick {
  let remainingSeconds = Math.max(0, seconds);
  const events = normalizeTempoEvents(tempoEvents, defaultBpm);

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const nextTick = events[index + 1]?.tick;
    if (nextTick === undefined) {
      return toTimelineTick(event.tick + quarterNotesToTicks(remainingSeconds / (60 / event.bpm)));
    }

    const segmentSeconds = ticksToQuarterNotes(nextTick - event.tick) * (60 / event.bpm);
    if (remainingSeconds <= segmentSeconds) {
      return toTimelineTick(event.tick + quarterNotesToTicks(remainingSeconds / (60 / event.bpm)));
    }
    remainingSeconds -= segmentSeconds;
  }

  return toTimelineTick(0);
}
