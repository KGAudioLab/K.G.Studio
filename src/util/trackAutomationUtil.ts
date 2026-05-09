import { KGTrackAutomationPoint, type TrackAutomationType } from '../core/track/KGTrackAutomationPoint';
import { AUDIO_INTERFACE_CONSTANTS } from '../constants/coreConstants';

export interface TrackAutomationValuePoint {
  beat: number;
  value: number;
}

export interface BakedTrackAutomationPoint {
  beat: number;
  value: number;
}

const BEAT_EPSILON = 1e-9;
const DEFAULT_TRACK_AUTOMATION_VALUES: Record<TrackAutomationType, number> = {
  volume: 0,
  pan: 0,
};

export function getTrackAutomationDefaultValue(type: TrackAutomationType): number {
  return DEFAULT_TRACK_AUTOMATION_VALUES[type];
}

export function clampTrackAutomationValue(type: TrackAutomationType, value: number): number {
  if (type === 'volume') {
    return Math.max(
      AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
      Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, value)
    );
  }

  return Math.max(-1, Math.min(1, value));
}

export function normalizeTrackAutomationPoints(
  points: Array<TrackAutomationValuePoint | KGTrackAutomationPoint>,
  type: TrackAutomationType
): TrackAutomationValuePoint[] {
  const normalized = [...points]
    .map(point => ({
      beat: point instanceof KGTrackAutomationPoint ? point.getBeat() : point.beat,
      value: point instanceof KGTrackAutomationPoint ? point.getValue() : point.value,
    }))
    .filter(point => Number.isFinite(point.beat) && Number.isFinite(point.value))
    .map(point => ({
      beat: point.beat,
      value: clampTrackAutomationValue(type, point.value),
    }))
    .sort((a, b) => a.beat - b.beat);

  const deduped: TrackAutomationValuePoint[] = [];
  normalized.forEach(point => {
    const lastPoint = deduped[deduped.length - 1];
    if (lastPoint && Math.abs(lastPoint.beat - point.beat) <= BEAT_EPSILON) {
      deduped[deduped.length - 1] = point;
      return;
    }

    deduped.push(point);
  });

  return deduped;
}

export function instantiateTrackAutomationPoints(
  type: TrackAutomationType,
  points: Array<{ id: string; beat: number; value: number }>
): KGTrackAutomationPoint[] {
  return normalizeTrackAutomationPoints(points, type).map(point => {
    const matchingSource = [...points].reverse().find(source => Math.abs(source.beat - point.beat) <= BEAT_EPSILON);
    return new KGTrackAutomationPoint(matchingSource?.id ?? '', point.beat, point.value);
  });
}

export function resolveTrackAutomationValueAtBeat(
  points: Array<TrackAutomationValuePoint | KGTrackAutomationPoint>,
  type: TrackAutomationType,
  beat: number,
  defaultValue: number,
): number {
  const normalizedPoints = normalizeTrackAutomationPoints(points, type);
  if (normalizedPoints.length === 0) {
    return defaultValue;
  }

  let previousPoint: TrackAutomationValuePoint | null = null;
  for (const point of normalizedPoints) {
    if (beat < point.beat) {
      if (!previousPoint) {
        return defaultValue;
      }

      const span = point.beat - previousPoint.beat;
      if (Math.abs(span) <= BEAT_EPSILON) {
        return point.value;
      }

      const ratio = (beat - previousPoint.beat) / span;
      return previousPoint.value + ((point.value - previousPoint.value) * ratio);
    }

    previousPoint = point;
  }

  return previousPoint?.value ?? defaultValue;
}

export function bakeTrackAutomationPointsInWindow(
  points: Array<TrackAutomationValuePoint | KGTrackAutomationPoint>,
  type: TrackAutomationType,
  windowStartBeat: number,
  windowEndBeat: number,
  maxIntervalMs: number,
  bpm: number,
  defaultValue: number = getTrackAutomationDefaultValue(type),
): BakedTrackAutomationPoint[] {
  const normalizedPoints = normalizeTrackAutomationPoints(points, type);
  const anchorPoint = {
    beat: windowStartBeat,
    value: resolveTrackAutomationValueAtBeat(normalizedPoints, type, windowStartBeat, defaultValue),
  };

  if (windowEndBeat <= windowStartBeat) {
    return [anchorPoint];
  }

  const baked: BakedTrackAutomationPoint[] = [anchorPoint];
  if (normalizedPoints.length === 0) {
    return baked;
  }

  const maxIntervalBeats = !Number.isFinite(maxIntervalMs) || maxIntervalMs <= 0
    ? Number.POSITIVE_INFINITY
    : (maxIntervalMs / 1000) * (bpm / 60);

  const appendPoint = (point: BakedTrackAutomationPoint) => {
    const lastPoint = baked[baked.length - 1];
    if (!lastPoint) {
      baked.push(point);
      return;
    }

    if (Math.abs(lastPoint.beat - point.beat) <= BEAT_EPSILON) {
      baked[baked.length - 1] = point;
      return;
    }

    if (Math.abs(lastPoint.value - point.value) <= BEAT_EPSILON) {
      return;
    }

    baked.push(point);
  };

  normalizedPoints.forEach(point => {
    if (point.beat > windowStartBeat && point.beat < windowEndBeat) {
      appendPoint(point);
    }
  });

  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const startPoint = normalizedPoints[index];
    const endPoint = normalizedPoints[index + 1];
    const overlapStartBeat = Math.max(windowStartBeat, startPoint.beat);
    const overlapEndBeat = Math.min(windowEndBeat, endPoint.beat);

    if (overlapEndBeat - overlapStartBeat <= BEAT_EPSILON) {
      continue;
    }

    if (Math.abs(startPoint.value - endPoint.value) <= BEAT_EPSILON) {
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

      const ratio = (beat - startPoint.beat) / (endPoint.beat - startPoint.beat);
      appendPoint({
        beat,
        value: clampTrackAutomationValue(type, startPoint.value + ((endPoint.value - startPoint.value) * ratio)),
      });
    }
  }

  return baked;
}
