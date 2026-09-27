import { KGTrackAutomationPoint, type TrackAutomationType } from '../core/track/KGTrackAutomationPoint';
import { AUDIO_INTERFACE_CONSTANTS } from '../constants/coreConstants';
import { TICKS_PER_QUARTER } from '../core/timing';

export interface TrackAutomationValuePoint {
  tick: number;
  value: number;
}

export interface BakedTrackAutomationPoint {
  tick: number;
  value: number;
}

const TICK_EPSILON = 0;
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
      tick: point instanceof KGTrackAutomationPoint ? point.getTick() : point.tick,
      value: point instanceof KGTrackAutomationPoint ? point.getValue() : point.value,
    }))
    .filter(point => Number.isFinite(point.tick) && Number.isFinite(point.value))
    .map(point => ({
      tick: Math.round(point.tick),
      value: clampTrackAutomationValue(type, point.value),
    }))
    .sort((a, b) => a.tick - b.tick);

  const deduped: TrackAutomationValuePoint[] = [];
  normalized.forEach(point => {
    const lastPoint = deduped[deduped.length - 1];
    if (lastPoint && Math.abs(lastPoint.tick - point.tick) <= TICK_EPSILON) {
      deduped[deduped.length - 1] = point;
      return;
    }

    deduped.push(point);
  });

  return deduped;
}

export function instantiateTrackAutomationPoints(
  type: TrackAutomationType,
  points: Array<{ id: string; tick: number; value: number }>
): KGTrackAutomationPoint[] {
  return normalizeTrackAutomationPoints(points, type).map(point => {
    const matchingSource = [...points].reverse().find(source => Math.abs(source.tick - point.tick) <= TICK_EPSILON);
    return new KGTrackAutomationPoint(matchingSource?.id ?? '', point.tick, point.value);
  });
}

export function resolveTrackAutomationValueAtTick(
  points: Array<TrackAutomationValuePoint | KGTrackAutomationPoint>,
  type: TrackAutomationType,
  tick: number,
  defaultValue: number,
): number {
  const normalizedPoints = normalizeTrackAutomationPoints(points, type);
  if (normalizedPoints.length === 0) {
    return defaultValue;
  }

  let previousPoint: TrackAutomationValuePoint | null = null;
  for (const point of normalizedPoints) {
    if (tick < point.tick) {
      if (!previousPoint) {
        return defaultValue;
      }

      const span = point.tick - previousPoint.tick;
      if (Math.abs(span) <= TICK_EPSILON) {
        return point.value;
      }

      const ratio = (tick - previousPoint.tick) / span;
      return previousPoint.value + ((point.value - previousPoint.value) * ratio);
    }

    previousPoint = point;
  }

  return previousPoint?.value ?? defaultValue;
}

export function bakeTrackAutomationPointsInWindow(
  points: Array<TrackAutomationValuePoint | KGTrackAutomationPoint>,
  type: TrackAutomationType,
  windowStartTick: number,
  windowEndTick: number,
  maxIntervalMs: number,
  bpm: number,
  defaultValue: number = getTrackAutomationDefaultValue(type),
): BakedTrackAutomationPoint[] {
  const normalizedPoints = normalizeTrackAutomationPoints(points, type);
  const anchorPoint = {
    tick: windowStartTick,
    value: resolveTrackAutomationValueAtTick(normalizedPoints, type, windowStartTick, defaultValue),
  };

  if (windowEndTick <= windowStartTick) {
    return [anchorPoint];
  }

  const baked: BakedTrackAutomationPoint[] = [anchorPoint];
  if (normalizedPoints.length === 0) {
    return baked;
  }

  const maxIntervalTicks = !Number.isFinite(maxIntervalMs) || maxIntervalMs <= 0
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.round((maxIntervalMs / 1000) * (bpm / 60) * TICKS_PER_QUARTER));

  const appendPoint = (point: BakedTrackAutomationPoint) => {
    const lastPoint = baked[baked.length - 1];
    if (!lastPoint) {
      baked.push(point);
      return;
    }

    if (Math.abs(lastPoint.tick - point.tick) <= TICK_EPSILON) {
      baked[baked.length - 1] = point;
      return;
    }

    if (Math.abs(lastPoint.value - point.value) <= TICK_EPSILON) {
      return;
    }

    baked.push(point);
  };

  normalizedPoints.forEach(point => {
    if (point.tick > windowStartTick && point.tick < windowEndTick) {
      appendPoint(point);
    }
  });

  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const startPoint = normalizedPoints[index];
    const endPoint = normalizedPoints[index + 1];
    const overlapStartTick = Math.max(windowStartTick, startPoint.tick);
    const overlapEndTick = Math.min(windowEndTick, endPoint.tick);

    if (overlapEndTick - overlapStartTick <= TICK_EPSILON) {
      continue;
    }

    if (Math.abs(startPoint.value - endPoint.value) <= TICK_EPSILON) {
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

      const ratio = (tick - startPoint.tick) / (endPoint.tick - startPoint.tick);
      appendPoint({
        tick,
        value: clampTrackAutomationValue(type, startPoint.value + ((endPoint.value - startPoint.value) * ratio)),
      });
    }
  }

  return baked;
}
