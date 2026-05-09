import { describe, expect, it } from 'vitest';
import { KGTrackAutomationPoint } from '../core/track/KGTrackAutomationPoint';
import {
  bakeTrackAutomationPointsInWindow,
  normalizeTrackAutomationPoints,
  resolveTrackAutomationValueAtBeat,
} from './trackAutomationUtil';

describe('trackAutomationUtil', () => {
  it('dedupes same-beat points and keeps the latest value', () => {
    const normalized = normalizeTrackAutomationPoints([
      { beat: 1, value: -6 },
      { beat: 1, value: -3 },
      { beat: 2, value: 1 },
    ], 'volume');

    expect(normalized).toEqual([
      { beat: 1, value: -3 },
      { beat: 2, value: 1 },
    ]);
  });

  it('interpolates between points and falls back to the default before the first point', () => {
    const points = [
      new KGTrackAutomationPoint('point-1', 1, -6),
      new KGTrackAutomationPoint('point-2', 3, 6),
    ];

    expect(resolveTrackAutomationValueAtBeat(points, 'volume', 0.5, 0)).toBe(0);
    expect(resolveTrackAutomationValueAtBeat(points, 'volume', 2, 0)).toBe(0);
  });

  it('bakes intermediate points for changing automation spans', () => {
    const baked = bakeTrackAutomationPointsInWindow([
      { beat: 0, value: 0 },
      { beat: 2, value: 1 },
    ], 'pan', 0, 2, 250, 120);

    expect(baked[0]).toEqual({ beat: 0, value: 0 });
    expect(baked.some(point => point.beat > 0 && point.beat < 2)).toBe(true);
  });
});
