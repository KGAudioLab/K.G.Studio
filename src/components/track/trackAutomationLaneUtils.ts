import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import type { TrackAutomationType } from '../../core/track/KGTrackAutomationPoint';

const LANE_PADDING_Y = 12;

export function formatAutomationValue(automationType: TrackAutomationType, value: number): string {
  if (automationType === 'volume') {
    if (value <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB) {
      return '−∞';
    }

    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}dB`;
  }

  const logicPanValue = value <= 0
    ? Math.round(value * 64)
    : Math.round(value * 63);
  return `${logicPanValue >= 0 ? '+' : ''}${logicPanValue}`;
}

export function getLaneMetrics(laneHeight: number) {
  const top = LANE_PADDING_Y;
  const bottom = laneHeight - LANE_PADDING_Y;
  const middle = Math.round((top + bottom) / 2);
  return { top, middle, bottom };
}

export function volumeToY(value: number, laneHeight: number): number {
  const clamped = Math.max(
    AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
    Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, value)
  );
  const { top, middle, bottom } = getLaneMetrics(laneHeight);

  if (clamped >= 0) {
    const normalized = clamped / AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB;
    return middle - (middle - top) * normalized;
  }

  const normalized = clamped / AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
  return middle + (bottom - middle) * normalized;
}

export function yToVolume(y: number, laneHeight: number): number {
  const { top, middle, bottom } = getLaneMetrics(laneHeight);
  const clampedY = Math.min(bottom, Math.max(top, y));

  if (clampedY <= middle) {
    const normalized = middle === top ? 0 : (middle - clampedY) / (middle - top);
    return Math.min(
      AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB,
      Math.max(0, normalized * AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB)
    );
  }

  const normalized = bottom === middle ? 0 : (clampedY - middle) / (bottom - middle);
  return Math.max(
    AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
    Math.min(0, normalized * AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB)
  );
}

export function panToY(value: number, laneHeight: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  const { top, middle, bottom } = getLaneMetrics(laneHeight);

  if (clamped === 0) {
    return middle;
  }

  if (clamped > 0) {
    return middle - (middle - top) * clamped;
  }

  return middle + (bottom - middle) * Math.abs(clamped);
}

export function yToPan(y: number, laneHeight: number): number {
  const { top, middle, bottom } = getLaneMetrics(laneHeight);
  const clampedY = Math.min(bottom, Math.max(top, y));

  if (Math.abs(clampedY - middle) <= 0.5) {
    return 0;
  }

  if (clampedY < middle) {
    const normalized = middle === top ? 0 : (middle - clampedY) / (middle - top);
    return Math.max(0, Math.min(1, normalized));
  }

  const normalized = bottom === middle ? 0 : (clampedY - middle) / (bottom - middle);
  return Math.max(-1, Math.min(0, -normalized));
}
