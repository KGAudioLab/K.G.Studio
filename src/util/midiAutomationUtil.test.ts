import { describe, expect, it } from 'vitest';
import { quarterNotesToTicks } from '../core/timing';

const q = quarterNotesToTicks;
import {
  bakeMidiAutomationPointsInWindow,
  collectRegionMidiAutomationPoints,
  normalizeMidiAutomationPoints,
  resolveMidiAutomationValueAtTick,
  resolveSustainExtendedEndTick,
  type MidiAutomationPoint,
} from './midiAutomationUtil';

const defaultOptions = {
  maxIntervalMs: 10,
  bpm: 120,
  defaultValue: 8192,
};

describe('midiAutomationUtil', () => {
  it('normalizes points and keeps the last duplicate tick', () => {
    const points: MidiAutomationPoint[] = [
      { tick: q(2), value: 1000 },
      { tick: q(1), value: 2000 },
      { tick: q(2), value: 3000 },
    ];

    expect(normalizeMidiAutomationPoints(points)).toEqual([
      { tick: q(1), value: 2000 },
      { tick: q(2), value: 3000 },
    ]);
  });

  it('holds the default value before the first point', () => {
    const points = [{ tick: q(4), value: 0 }];

    expect(resolveMidiAutomationValueAtTick(points, q(2), 8192)).toBe(8192);
  });

  it('interpolates linearly between two points', () => {
    const points = [
      { tick: q(0), value: 8192 },
      { tick: q(4), value: 0 },
    ];

    expect(resolveMidiAutomationValueAtTick(points, q(2), 8192)).toBe(4096);
  });

  it('holds the last value after the final point', () => {
    const points = [{ tick: q(1), value: 2048 }];

    expect(resolveMidiAutomationValueAtTick(points, q(8), 8192)).toBe(2048);
  });

  it('collects region-local points into absolute beats', () => {
    const collected = collectRegionMidiAutomationPoints([
      { startTick: q(4), points: [{ tick: q(0.5), value: 7000 }] },
      { startTick: q(1), points: [{ tick: q(0.25), value: 6000 }] },
    ]);

    expect(collected).toEqual([
      { tick: q(1.25), value: 6000 },
      { tick: q(4.5), value: 7000 },
    ]);
  });

  it('bakes dense points according to the requested ms interval', () => {
    const points = [
      { tick: q(0), value: 8192 },
      { tick: q(1), value: 0 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(1), { ...defaultOptions, maxIntervalMs: 20 })).toHaveLength(26);
    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(1), { ...defaultOptions, maxIntervalMs: 10 })).toHaveLength(51);
    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(1), { ...defaultOptions, maxIntervalMs: 5 })).toHaveLength(96);
  });

  it('quantizes the window anchor to an integer MIDI pitch-bend value', () => {
    const points = [
      { tick: q(0), value: 8192 },
      { tick: q(1), value: 8193 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, q(0.5), q(1), { ...defaultOptions, maxIntervalMs: 20 })[0]).toEqual({
      tick: q(0.5),
      value: 8193,
    });
  });

  it('drops adjacent interpolated points that round to the same MIDI value', () => {
    const points = [
      { tick: q(0), value: 8192 },
      { tick: q(1), value: 8193 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(1), { ...defaultOptions, maxIntervalMs: 20 })).toEqual([
      { tick: q(0), value: 8192 },
      { tick: q(0.5), value: 8193 },
    ]);
  });

  it('treats flat segments as holds without adding interior baked points', () => {
    const points = [
      { tick: q(0), value: 4096 },
      { tick: q(4), value: 4096 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(4), { ...defaultOptions, maxIntervalMs: 10 })).toEqual([
      { tick: q(0), value: 4096 },
    ]);
  });

  it('collapses consecutive baked points with the same value', () => {
    const points = [
      { tick: q(0.5), value: 8192 },
      { tick: q(1), value: 4096 },
      { tick: q(2), value: 4096 },
      { tick: q(3), value: 0 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(4), { ...defaultOptions, maxIntervalMs: 500 })).toEqual([
      { tick: q(0), value: 8192 },
      { tick: q(1), value: 4096 },
      { tick: q(3), value: 0 },
    ]);
  });

  it('keeps later changing segments after skipping a flat segment', () => {
    const points = [
      { tick: q(0), value: 4096 },
      { tick: q(2), value: 4096 },
      { tick: q(4), value: 0 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, q(0), q(4), { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked).toEqual([
      { tick: q(0), value: 4096 },
      { tick: q(3), value: 2048 },
    ]);
  });

  it('stores baked interpolated values as integers', () => {
    const points = [
      { tick: q(0), value: 8192 },
      { tick: q(3), value: 8195 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, q(0), q(3), { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked.every(point => Number.isInteger(point.value))).toBe(true);
  });

  it('adds a window anchor and preserves the correct loop boundary value', () => {
    const points = [
      { tick: q(2), value: 0 },
      { tick: q(6), value: 8192 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, q(4), q(8), { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked[0]).toEqual({ tick: q(4), value: 4096 });
    expect(baked.some(point => point.tick === q(5) && point.value === 6144)).toBe(true);
    expect(baked.some(point => point.tick === q(6) && point.value === 8192)).toBe(true);
  });

  it('uses step interpolation for switch-style automation', () => {
    const points = [
      { tick: q(1), value: 127 },
      { tick: q(3), value: 0 },
    ];

    expect(resolveMidiAutomationValueAtTick(points, q(2), 0, 'step')).toBe(127);
    expect(bakeMidiAutomationPointsInWindow(points, q(0), q(4), {
      ...defaultOptions,
      defaultValue: 0,
      interpolationMode: 'step',
      quantizeValue: (value) => value,
    })).toEqual([
      { tick: q(0), value: 0 },
      { tick: q(1), value: 127 },
      { tick: q(3), value: 0 },
    ]);
  });

  it('extends note ends until the next sustain release', () => {
    const points = [
      { tick: q(1), value: 127 },
      { tick: q(4), value: 0 },
    ];

    expect(resolveSustainExtendedEndTick(points, q(2), 0)).toBe(q(4));
    expect(resolveSustainExtendedEndTick(points, q(5), 0)).toBe(q(5));
  });
});
