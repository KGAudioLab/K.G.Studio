import type { MainContentSnappingMode } from '../core/KGProject';

export type MainContentSnapRounding = 'nearest' | 'ceil' | 'floor';

export interface MainContentSnapSettings {
  enabled: boolean;
  mode: MainContentSnappingMode;
  beatsPerBar: number;
}

export function snapBarValue(
  valueInBars: number,
  settings: MainContentSnapSettings,
  rounding: MainContentSnapRounding = 'nearest'
): number {
  if (!settings.enabled) {
    return valueInBars;
  }

  const subdivisions = settings.mode === 'beat'
    ? Math.max(1, settings.beatsPerBar)
    : 1;
  const scaledValue = valueInBars * subdivisions;
  const round = rounding === 'ceil'
    ? Math.ceil
    : rounding === 'floor'
      ? Math.floor
      : Math.round;

  return round(scaledValue) / subdivisions;
}
