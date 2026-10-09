import { describe, expect, it, vi } from 'vitest';
import { simplifyAirePoints, AIRE_SIMPLIFICATION_TOLERANCES } from './simplification';
import { AIRE_CONTROLLERS, type AirePoint } from './types';
import { resolveMidiAutomationValueAtTick } from '../midiAutomationUtil';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import { HumanizeMidiRegionCommand } from '../../core/commands/region/HumanizeMidiRegionCommand';
import { instanceToPlain, plainToInstance } from 'class-transformer';

const curve = (values: number[]): AirePoint[] => values.map((value, i) => ({ tick: i * 60, value }));
const fixtures = [
  curve([0, 10, 20, 30, 40, 50]),
  curve([64, 64, 64, 64, 64]),
  curve([0, 0, 1, 1, 2, 2, 3, 3, 4]),
  curve([40, 45, 50, 51, 52, 30, 5, 6, 10]),
  curve([0, 127, 0, 127, 0, 127, 0]),
  curve([0, 10, 20, 20, 20, 10, 5, 5, 5, 15, 20]),
  [{ tick: 0, value: 0 }, { tick: 1, value: 1 }, { tick: 100, value: 10 }, { tick: 101, value: 11 }, { tick: 300, value: 20 }],
];

describe('AIRE curve simplification', () => {
  it('defaults to None and keeps the exact original dense output', () => {
    for (const points of fixtures) {
      expect(simplifyAirePoints(points)).toBe(points);
      expect(simplifyAirePoints(points, 'none')).toBe(points);
    }
  });
  it('handles empty, one-point and two-point curves', () => {
    for (const points of [[], curve([64]), curve([10, 90])]) expect(simplifyAirePoints(points, 'aggressive')).toBe(points);
  });
  it('reduces straight ramps and constant curves to endpoints', () => {
    for (const points of fixtures.slice(0, 2)) expect(simplifyAirePoints(points, 'mild')).toEqual([points[0], points.at(-1)]);
  });
  it('keeps exact peaks, valleys and both ends of turning plateaus', () => {
    const points = fixtures[5];
    const result = simplifyAirePoints(points, 'aggressive');
    for (const i of [0, 2, 4, 6, 8, 10]) expect(result).toContain(points[i]);
    expect(simplifyAirePoints(fixtures[4], 'aggressive')).toEqual(fixtures[4]);
  });
  it('preserves points immediately before and at tempo joins', () => {
    const points = curve([0, 10, 20, 30, 40, 50]);
    expect(simplifyAirePoints(points, 'aggressive', [180])).toEqual([points[0], points[2], points[3], points[5]]);
    expect(simplifyAirePoints(points, 'aggressive', [181])).toEqual([points[0], points[3], points[4], points[5]]);
  });
  it('breaks equal-error ties by retaining the earliest point', () => {
    const points = curve([0, 4, 6, 6]);
    expect(simplifyAirePoints(points, 'mild')).toEqual([points[0], points[1], points[3]]);
  });
  it('bounds vertical interpolation error and never increases point count with strength', () => {
    const long = curve(Array.from({ length: 4097 }, (_, i) => Math.round(64 + 45 * Math.sin(i / 83) + 8 * Math.sin(i / 17))));
    for (const points of [...fixtures, long]) {
      let previous = points;
      for (const level of ['mild', 'medium', 'aggressive'] as const) {
        const result = simplifyAirePoints(points, level);
        expect(result.length).toBeLessThanOrEqual(previous.length);
        for (const point of result) {
          expect(previous).toContain(point);
          expect(point.value).toBeGreaterThanOrEqual(0); expect(point.value).toBeLessThanOrEqual(127);
        }
        expect(result[0]).toBe(points[0]); expect(result.at(-1)).toBe(points.at(-1));
        for (const point of points) expect(Math.abs(resolveMidiAutomationValueAtTick(result, point.tick, 0) - point.value)).toBeLessThanOrEqual(AIRE_SIMPLIFICATION_TOLERANCES[level] + 1e-10);
        previous = result;
      }
    }
  });
  it.each(AIRE_CONTROLLERS)('preserves CC%i boundaries, serialization and exact undo/redo', controller => {
    const project = new KGProject(), track = new KGMidiTrack('track', 0, 'Test');
    const region = new KGMidiRegion('region', 'track', 0, 'Test', 0, 1200);
    track.addRegion(region); project.setTracks([track]);
    vi.mocked(KGCore.instance().getCurrentProject).mockReturnValue(project);
    for (const cc of AIRE_CONTROLLERS) region.setControllerEvents(cc, [new KGMidiControllerEvent(`before-${cc}`, 0, 20), new KGMidiControllerEvent(`after-${cc}`, 1000, 100)]);
    const original = instanceToPlain(region);
    const before = region.getControllerEvents(controller).map(e => ({ tick: e.getTick(), value: e.getValue() }));
    const points = curve([20, 30, 40, 50, 60, 70]).map(p => ({ ...p, tick: p.tick + 300 }));
    const command = new HumanizeMidiRegionCommand(region, 300, 700, simplifyAirePoints(points, 'medium'), controller);
    command.execute();
    const changed = instanceToPlain(region);
    const after = region.getControllerEvents(controller).map(e => ({ tick: e.getTick(), value: e.getValue() }));
    for (const tick of [0, 100, 299, 700, 800, 1000, 1100]) expect(resolveMidiAutomationValueAtTick(after, tick, 0)).toBeCloseTo(resolveMidiAutomationValueAtTick(before, tick, 0), 10);
    expect(instanceToPlain(plainToInstance(KGMidiRegion, changed))).toEqual(changed);
    command.undo(); expect(instanceToPlain(region)).toEqual(original);
    command.execute(); expect(instanceToPlain(region)).toEqual(changed);
  });
});
