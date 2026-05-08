import { describe, expect, it } from 'vitest';
import {
  bakeMidiAutomationPointsInWindow,
  collectRegionMidiAutomationPoints,
  normalizeMidiAutomationPoints,
  resolveMidiAutomationValueAtBeat,
  resolveSustainExtendedEndBeat,
  type MidiAutomationPoint,
} from './midiAutomationUtil';

const defaultOptions = {
  maxIntervalMs: 10,
  bpm: 120,
  defaultValue: 8192,
};

describe('midiAutomationUtil', () => {
  it('normalizes points and keeps the last duplicate beat', () => {
    const points: MidiAutomationPoint[] = [
      { beat: 2, value: 1000 },
      { beat: 1, value: 2000 },
      { beat: 2, value: 3000 },
    ];

    expect(normalizeMidiAutomationPoints(points)).toEqual([
      { beat: 1, value: 2000 },
      { beat: 2, value: 3000 },
    ]);
  });

  it('holds the default value before the first point', () => {
    const points = [{ beat: 4, value: 0 }];

    expect(resolveMidiAutomationValueAtBeat(points, 2, 8192)).toBe(8192);
  });

  it('interpolates linearly between two points', () => {
    const points = [
      { beat: 0, value: 8192 },
      { beat: 4, value: 0 },
    ];

    expect(resolveMidiAutomationValueAtBeat(points, 2, 8192)).toBe(4096);
  });

  it('holds the last value after the final point', () => {
    const points = [{ beat: 1, value: 2048 }];

    expect(resolveMidiAutomationValueAtBeat(points, 8, 8192)).toBe(2048);
  });

  it('collects region-local points into absolute beats', () => {
    const collected = collectRegionMidiAutomationPoints([
      { startBeat: 4, points: [{ beat: 0.5, value: 7000 }] },
      { startBeat: 1, points: [{ beat: 0.25, value: 6000 }] },
    ]);

    expect(collected).toEqual([
      { beat: 1.25, value: 6000 },
      { beat: 4.5, value: 7000 },
    ]);
  });

  it('bakes dense points according to the requested ms interval', () => {
    const points = [
      { beat: 0, value: 8192 },
      { beat: 1, value: 0 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, 0, 1, { ...defaultOptions, maxIntervalMs: 20 })).toHaveLength(25);
    expect(bakeMidiAutomationPointsInWindow(points, 0, 1, { ...defaultOptions, maxIntervalMs: 10 })).toHaveLength(50);
    expect(bakeMidiAutomationPointsInWindow(points, 0, 1, { ...defaultOptions, maxIntervalMs: 5 })).toHaveLength(100);
  });

  it('quantizes the window anchor to an integer MIDI pitch-bend value', () => {
    const points = [
      { beat: 0, value: 8192 },
      { beat: 1, value: 8193 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, 0.5, 1, { ...defaultOptions, maxIntervalMs: 20 })[0]).toEqual({
      beat: 0.5,
      value: 8193,
    });
  });

  it('drops adjacent interpolated points that round to the same MIDI value', () => {
    const points = [
      { beat: 0, value: 8192 },
      { beat: 1, value: 8193 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, 0, 1, { ...defaultOptions, maxIntervalMs: 20 })).toEqual([
      { beat: 0, value: 8192 },
      { beat: 0.52, value: 8193 },
    ]);
  });

  it('treats flat segments as holds without adding interior baked points', () => {
    const points = [
      { beat: 0, value: 4096 },
      { beat: 4, value: 4096 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, 0, 4, { ...defaultOptions, maxIntervalMs: 10 })).toEqual([
      { beat: 0, value: 4096 },
    ]);
  });

  it('collapses consecutive baked points with the same value', () => {
    const points = [
      { beat: 0.5, value: 8192 },
      { beat: 1, value: 4096 },
      { beat: 2, value: 4096 },
      { beat: 3, value: 0 },
    ];

    expect(bakeMidiAutomationPointsInWindow(points, 0, 4, { ...defaultOptions, maxIntervalMs: 500 })).toEqual([
      { beat: 0, value: 8192 },
      { beat: 1, value: 4096 },
      { beat: 3, value: 0 },
    ]);
  });

  it('keeps later changing segments after skipping a flat segment', () => {
    const points = [
      { beat: 0, value: 4096 },
      { beat: 2, value: 4096 },
      { beat: 4, value: 0 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, 0, 4, { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked).toEqual([
      { beat: 0, value: 4096 },
      { beat: 3, value: 2048 },
    ]);
  });

  it('stores baked interpolated values as integers', () => {
    const points = [
      { beat: 0, value: 8192 },
      { beat: 3, value: 8195 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, 0, 3, { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked.every(point => Number.isInteger(point.value))).toBe(true);
  });

  it('adds a window anchor and preserves the correct loop boundary value', () => {
    const points = [
      { beat: 2, value: 0 },
      { beat: 6, value: 8192 },
    ];

    const baked = bakeMidiAutomationPointsInWindow(points, 4, 8, { ...defaultOptions, maxIntervalMs: 500 });

    expect(baked[0]).toEqual({ beat: 4, value: 4096 });
    expect(baked.some(point => point.beat === 5 && point.value === 6144)).toBe(true);
    expect(baked.some(point => point.beat === 6 && point.value === 8192)).toBe(true);
  });

  it('uses step interpolation for switch-style automation', () => {
    const points = [
      { beat: 1, value: 127 },
      { beat: 3, value: 0 },
    ];

    expect(resolveMidiAutomationValueAtBeat(points, 2, 0, 'step')).toBe(127);
    expect(bakeMidiAutomationPointsInWindow(points, 0, 4, {
      ...defaultOptions,
      defaultValue: 0,
      interpolationMode: 'step',
      quantizeValue: (value) => value,
    })).toEqual([
      { beat: 0, value: 0 },
      { beat: 1, value: 127 },
      { beat: 3, value: 0 },
    ]);
  });

  it('extends note ends until the next sustain release', () => {
    const points = [
      { beat: 1, value: 127 },
      { beat: 4, value: 0 },
    ];

    expect(resolveSustainExtendedEndBeat(points, 2, 0)).toBe(4);
    expect(resolveSustainExtendedEndBeat(points, 5, 0)).toBe(5);
  });
});
