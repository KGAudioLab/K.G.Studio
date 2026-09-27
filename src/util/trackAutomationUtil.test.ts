import { describe, expect, it } from 'vitest';
import { quarterNotesToTicks } from '../core/timing';

const q = quarterNotesToTicks;
import { KGTrackAutomationPoint } from '../core/track/KGTrackAutomationPoint';
import {
  bakeTrackAutomationPointsInWindow,
  normalizeTrackAutomationPoints,
  resolveTrackAutomationValueAtTick,
} from './trackAutomationUtil';

describe('trackAutomationUtil', () => {
  it('dedupes same-tick points and keeps the latest value', () => {
    const normalized = normalizeTrackAutomationPoints([
      { tick: q(1), value: -6 },
      { tick: q(1), value: -3 },
      { tick: q(2), value: 1 },
    ], 'volume');

    expect(normalized).toEqual([
      { tick: q(1), value: -3 },
      { tick: q(2), value: 1 },
    ]);
  });

  it('interpolates between points and falls back to the default before the first point', () => {
    const points = [
      new KGTrackAutomationPoint('point-1', q(1), -6),
      new KGTrackAutomationPoint('point-2', q(3), 6),
    ];

    expect(resolveTrackAutomationValueAtTick(points, 'volume', q(0.5), 0)).toBe(0);
    expect(resolveTrackAutomationValueAtTick(points, 'volume', q(2), 0)).toBe(0);
  });

  it('bakes intermediate points for changing automation spans', () => {
    const baked = bakeTrackAutomationPointsInWindow([
      { tick: q(0), value: 0 },
      { tick: q(2), value: 1 },
    ], 'pan', q(0), q(2), 250, 120);

    expect(baked[0]).toEqual({ tick: q(0), value: 0 });
    expect(baked.some(point => point.tick > q(0) && point.tick < q(2))).toBe(true);
  });
});
