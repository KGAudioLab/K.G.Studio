import { describe, expect, it } from 'vitest';
import { snapBarValue } from './mainContentSnapUtil';

describe('snapBarValue', () => {
  it('preserves fractional values when snapping is disabled', () => {
    expect(snapBarValue(1.37, { enabled: false, mode: 'beat', beatsPerBar: 4 })).toBe(1.37);
  });

  it('rounds to whole bars in bar mode', () => {
    expect(snapBarValue(1.49, { enabled: true, mode: 'bar', beatsPerBar: 4 })).toBe(1);
    expect(snapBarValue(1.51, { enabled: true, mode: 'bar', beatsPerBar: 4 })).toBe(2);
  });

  it('rounds to beat subdivisions for the active time signature', () => {
    expect(snapBarValue(1.37, { enabled: true, mode: 'beat', beatsPerBar: 4 })).toBe(1.25);
    expect(snapBarValue(1.2, { enabled: true, mode: 'beat', beatsPerBar: 3 })).toBeCloseTo(4 / 3);
  });

  it('supports directional snapping for media boundary clamping', () => {
    const settings = { enabled: true, mode: 'beat' as const, beatsPerBar: 4 };
    expect(snapBarValue(1.26, settings, 'ceil')).toBe(1.5);
    expect(snapBarValue(1.49, settings, 'floor')).toBe(1.25);
  });
});
