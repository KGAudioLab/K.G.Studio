import { clampMidiPitchBendValue } from './midiUtil';
import { TICKS_PER_QUARTER } from '../core/timing';

export interface MidiAutomationPoint {
  tick: number;
  value: number;
}

export interface BakedMidiAutomationPoint {
  tick: number;
  value: number;
}

export interface MidiAutomationBakeOptions {
  maxIntervalMs: number;
  bpm: number;
  defaultValue: number;
  interpolationMode?: 'linear' | 'step';
  quantizeValue?: (value: number) => number;
}

const TICK_EPSILON = 0;

function quantizeBakedValue(value: number): number {
  return clampMidiPitchBendValue(value);
}

function quantizeValue(value: number, options: MidiAutomationBakeOptions): number {
  return options.quantizeValue ? options.quantizeValue(value) : quantizeBakedValue(value);
}

function appendPoint(points: BakedMidiAutomationPoint[], nextPoint: BakedMidiAutomationPoint): void {
  const lastPoint = points[points.length - 1];
  if (!lastPoint) {
    points.push(nextPoint);
    return;
  }

  if (Math.abs(lastPoint.tick - nextPoint.tick) <= TICK_EPSILON) {
    points[points.length - 1] = nextPoint;
    return;
  }

  if (lastPoint.value === nextPoint.value) {
    return;
  }

  points.push(nextPoint);
}

function interpolateBetweenPoints(startPoint: MidiAutomationPoint, endPoint: MidiAutomationPoint, tick: number): number {
  if (Math.abs(endPoint.tick - startPoint.tick) <= TICK_EPSILON) {
    return endPoint.value;
  }

  const progress = (tick - startPoint.tick) / (endPoint.tick - startPoint.tick);
  return startPoint.value + ((endPoint.value - startPoint.value) * progress);
}

function getMaxIntervalTicks(options: MidiAutomationBakeOptions): number {
  if (!Number.isFinite(options.maxIntervalMs) || options.maxIntervalMs <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(1, Math.round((options.maxIntervalMs / 1000) * (options.bpm / 60) * TICKS_PER_QUARTER));
}

export function normalizeMidiAutomationPoints(points: MidiAutomationPoint[]): MidiAutomationPoint[] {
  const sortedPoints = [...points]
    .filter(point => Number.isFinite(point.tick) && Number.isFinite(point.value))
    .map(point => ({ ...point, tick: Math.round(point.tick) }))
    .sort((a, b) => a.tick - b.tick);
  const normalizedPoints: MidiAutomationPoint[] = [];

  sortedPoints.forEach(point => {
    const lastPoint = normalizedPoints[normalizedPoints.length - 1];
    if (lastPoint && Math.abs(lastPoint.tick - point.tick) <= TICK_EPSILON) {
      normalizedPoints[normalizedPoints.length - 1] = point;
      return;
    }

    normalizedPoints.push(point);
  });

  return normalizedPoints;
}

export function collectRegionMidiAutomationPoints(
  regions: Array<{ startTick: number; points: MidiAutomationPoint[] }>
): MidiAutomationPoint[] {
  return normalizeMidiAutomationPoints(
    regions.flatMap(region => region.points.map(point => ({
      tick: region.startTick + point.tick,
      value: point.value,
    })))
  );
}

export function resolveMidiAutomationValueAtTick(
  points: MidiAutomationPoint[],
  tick: number,
  defaultValue: number,
  interpolationMode: 'linear' | 'step' = 'linear'
): number {
  const normalizedPoints = normalizeMidiAutomationPoints(points);
  if (normalizedPoints.length === 0) {
    return defaultValue;
  }

  let previousPoint: MidiAutomationPoint | null = null;
  for (const point of normalizedPoints) {
    if (tick < point.tick) {
      if (!previousPoint) {
        return defaultValue;
      }

      if (interpolationMode === 'step') {
        return previousPoint.value;
      }

      return interpolateBetweenPoints(previousPoint, point, tick);
    }

    previousPoint = point;
  }

  return previousPoint?.value ?? defaultValue;
}

export function bakeMidiAutomationPointsInWindow(
  points: MidiAutomationPoint[],
  windowStartTick: number,
  windowEndTick: number,
  options: MidiAutomationBakeOptions
): BakedMidiAutomationPoint[] {
  const normalizedPoints = normalizeMidiAutomationPoints(points);
  const interpolationMode = options.interpolationMode ?? 'linear';
  const anchorPoint = {
    tick: windowStartTick,
    value: quantizeValue(
      resolveMidiAutomationValueAtTick(normalizedPoints, windowStartTick, options.defaultValue, interpolationMode),
      options
    ),
  };

  if (windowEndTick <= windowStartTick) {
    return [anchorPoint];
  }

  const bakedPoints: BakedMidiAutomationPoint[] = [anchorPoint];
  if (normalizedPoints.length === 0) {
    return bakedPoints;
  }

  const firstPoint = normalizedPoints[0];
  if (windowStartTick < firstPoint.tick && firstPoint.tick < windowEndTick) {
    appendPoint(bakedPoints, { tick: firstPoint.tick, value: quantizeValue(firstPoint.value, options) });
  }

  if (interpolationMode === 'step') {
    normalizedPoints.forEach(point => {
      if (point.tick <= windowStartTick + TICK_EPSILON || point.tick >= windowEndTick - TICK_EPSILON) {
        return;
      }

      appendPoint(bakedPoints, {
        tick: point.tick,
        value: quantizeValue(point.value, options),
      });
    });

    return bakedPoints;
  }

  const maxIntervalTicks = getMaxIntervalTicks(options);
  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const startPoint = normalizedPoints[index];
    const endPoint = normalizedPoints[index + 1];
    const overlapStartTick = Math.max(windowStartTick, startPoint.tick);
    const overlapEndTick = Math.min(windowEndTick, endPoint.tick);

    if (overlapEndTick - overlapStartTick <= TICK_EPSILON) {
      continue;
    }

    // MIDI pitch bend playback here is event-based, not continuous on its own.
    // The last emitted value is held until a later baked event changes it.
    //
    // That means a flat authored span such as:
    //   tick 1 -> value 0
    //   tick 2 -> value 0
    //   tick 3 -> value 100
    // should *not* generate any intermediate events between ticks 1 and 2.
    // The value from tick 1 is simply held through tick 2, and the bend only
    // begins once we emit the first baked point from the changing 2 -> 3 segment.
    //
    // In practice that first changing baked point may land slightly after tick 2
    // depending on the bake interval (for example 10 ms), but it still does not
    // cause an earlier gradual bend from tick 1. Skipping flat segments preserves
    // the intended "hold, then change" behavior while also avoiding redundant
    // scheduled pitch-bend events.
    if (startPoint.value === endPoint.value) {
      continue;
    }

    const segmentLengthTicks = overlapEndTick - overlapStartTick;
    const segmentCount = Number.isFinite(maxIntervalTicks)
      ? Math.max(1, Math.ceil(segmentLengthTicks / maxIntervalTicks))
      : 1;

    for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
      const tick = Math.round(overlapStartTick + ((segmentLengthTicks * segmentIndex) / segmentCount));
      if (tick >= windowEndTick - TICK_EPSILON) {
        continue;
      }

      appendPoint(bakedPoints, {
        tick,
        value: quantizeValue(interpolateBetweenPoints(startPoint, endPoint, tick), options),
      });
    }
  }

  return bakedPoints;
}

export function resolveSustainExtendedEndTick(
  points: MidiAutomationPoint[],
  noteEndTick: number,
  defaultValue: number,
  fallbackEndTick: number
): number {
  const normalizedPoints = normalizeMidiAutomationPoints(points);
  if (normalizedPoints.length === 0) {
    return noteEndTick;
  }

  const sustainValueAtEnd = resolveMidiAutomationValueAtTick(normalizedPoints, noteEndTick, defaultValue, 'step');
  if (sustainValueAtEnd < 64) {
    return noteEndTick;
  }

  const releasePoint = normalizedPoints.find(point => point.tick > noteEndTick && point.value < 64);
  // A final pedal-down point still sustains notes. Without an authored release,
  // callers supply a finite region/playback boundary to avoid hanging notes.
  return releasePoint?.tick ?? Math.max(noteEndTick, fallbackEndTick);
}
