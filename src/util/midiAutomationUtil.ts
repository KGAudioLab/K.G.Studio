import { clampMidiPitchBendValue } from './midiUtil';

export interface MidiAutomationPoint {
  beat: number;
  value: number;
}

export interface BakedMidiAutomationPoint {
  beat: number;
  value: number;
}

export interface MidiAutomationBakeOptions {
  maxIntervalMs: number;
  bpm: number;
  defaultValue: number;
}

const BEAT_EPSILON = 1e-9;

function quantizeBakedValue(value: number): number {
  return clampMidiPitchBendValue(value);
}

function appendPoint(points: BakedMidiAutomationPoint[], nextPoint: BakedMidiAutomationPoint): void {
  const lastPoint = points[points.length - 1];
  if (!lastPoint) {
    points.push(nextPoint);
    return;
  }

  if (Math.abs(lastPoint.beat - nextPoint.beat) <= BEAT_EPSILON) {
    points[points.length - 1] = nextPoint;
    return;
  }

  if (lastPoint.value === nextPoint.value) {
    return;
  }

  points.push(nextPoint);
}

function interpolateBetweenPoints(startPoint: MidiAutomationPoint, endPoint: MidiAutomationPoint, beat: number): number {
  if (Math.abs(endPoint.beat - startPoint.beat) <= BEAT_EPSILON) {
    return endPoint.value;
  }

  const progress = (beat - startPoint.beat) / (endPoint.beat - startPoint.beat);
  return startPoint.value + ((endPoint.value - startPoint.value) * progress);
}

function getMaxIntervalBeats(options: MidiAutomationBakeOptions): number {
  if (!Number.isFinite(options.maxIntervalMs) || options.maxIntervalMs <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return (options.maxIntervalMs / 1000) * (options.bpm / 60);
}

export function normalizeMidiAutomationPoints(points: MidiAutomationPoint[]): MidiAutomationPoint[] {
  const sortedPoints = [...points]
    .filter(point => Number.isFinite(point.beat) && Number.isFinite(point.value))
    .sort((a, b) => a.beat - b.beat);
  const normalizedPoints: MidiAutomationPoint[] = [];

  sortedPoints.forEach(point => {
    const lastPoint = normalizedPoints[normalizedPoints.length - 1];
    if (lastPoint && Math.abs(lastPoint.beat - point.beat) <= BEAT_EPSILON) {
      normalizedPoints[normalizedPoints.length - 1] = point;
      return;
    }

    normalizedPoints.push(point);
  });

  return normalizedPoints;
}

export function collectRegionMidiAutomationPoints(
  regions: Array<{ startBeat: number; points: MidiAutomationPoint[] }>
): MidiAutomationPoint[] {
  return normalizeMidiAutomationPoints(
    regions.flatMap(region => region.points.map(point => ({
      beat: region.startBeat + point.beat,
      value: point.value,
    })))
  );
}

export function resolveMidiAutomationValueAtBeat(
  points: MidiAutomationPoint[],
  beat: number,
  defaultValue: number
): number {
  const normalizedPoints = normalizeMidiAutomationPoints(points);
  if (normalizedPoints.length === 0) {
    return defaultValue;
  }

  let previousPoint: MidiAutomationPoint | null = null;
  for (const point of normalizedPoints) {
    if (beat < point.beat) {
      if (!previousPoint) {
        return defaultValue;
      }

      return interpolateBetweenPoints(previousPoint, point, beat);
    }

    previousPoint = point;
  }

  return previousPoint?.value ?? defaultValue;
}

export function bakeMidiAutomationPointsInWindow(
  points: MidiAutomationPoint[],
  windowStartBeat: number,
  windowEndBeat: number,
  options: MidiAutomationBakeOptions
): BakedMidiAutomationPoint[] {
  const normalizedPoints = normalizeMidiAutomationPoints(points);
  const anchorPoint = {
    beat: windowStartBeat,
    value: quantizeBakedValue(resolveMidiAutomationValueAtBeat(normalizedPoints, windowStartBeat, options.defaultValue)),
  };

  if (windowEndBeat <= windowStartBeat) {
    return [anchorPoint];
  }

  const bakedPoints: BakedMidiAutomationPoint[] = [anchorPoint];
  if (normalizedPoints.length === 0) {
    return bakedPoints;
  }

  const firstPoint = normalizedPoints[0];
  if (windowStartBeat < firstPoint.beat && firstPoint.beat < windowEndBeat) {
    appendPoint(bakedPoints, { beat: firstPoint.beat, value: quantizeBakedValue(firstPoint.value) });
  }

  const maxIntervalBeats = getMaxIntervalBeats(options);
  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const startPoint = normalizedPoints[index];
    const endPoint = normalizedPoints[index + 1];
    const overlapStartBeat = Math.max(windowStartBeat, startPoint.beat);
    const overlapEndBeat = Math.min(windowEndBeat, endPoint.beat);

    if (overlapEndBeat - overlapStartBeat <= BEAT_EPSILON) {
      continue;
    }

    // MIDI pitch bend playback here is event-based, not continuous on its own.
    // The last emitted value is held until a later baked event changes it.
    //
    // That means a flat authored span such as:
    //   beat 1 -> value 0
    //   beat 2 -> value 0
    //   beat 3 -> value 100
    // should *not* generate any intermediate events between beats 1 and 2.
    // The value from beat 1 is simply held through beat 2, and the bend only
    // begins once we emit the first baked point from the changing 2 -> 3 segment.
    //
    // In practice that first changing baked point may land slightly after beat 2
    // depending on the bake interval (for example 10 ms), but it still does not
    // cause an earlier gradual bend from beat 1. Skipping flat segments preserves
    // the intended "hold, then change" behavior while also avoiding redundant
    // scheduled pitch-bend events.
    if (startPoint.value === endPoint.value) {
      continue;
    }

    const segmentLengthBeats = overlapEndBeat - overlapStartBeat;
    const segmentCount = Number.isFinite(maxIntervalBeats)
      ? Math.max(1, Math.ceil(segmentLengthBeats / maxIntervalBeats))
      : 1;

    for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex += 1) {
      const beat = overlapStartBeat + ((segmentLengthBeats * segmentIndex) / segmentCount);
      if (beat >= windowEndBeat - BEAT_EPSILON) {
        continue;
      }

      appendPoint(bakedPoints, {
        beat,
        value: quantizeBakedValue(interpolateBetweenPoints(startPoint, endPoint, beat)),
      });
    }
  }

  return bakedPoints;
}
