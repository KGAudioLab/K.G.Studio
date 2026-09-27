import { describe, expect, it } from 'vitest';
import {
  TICKS_PER_QUARTER,
  barBeatTickToTicks,
  formatBarBeatTick,
  noteValueToTicks,
  parseBarBeatTick,
  secondsToTick,
  tickToSeconds,
  ticksPerBar,
  ticksPerMeterBeat,
  ticksToBarBeatTick,
  toTimelineTick,
} from './timing';

describe('canonical timeline timing', () => {
  it('uses fixed 960 PPQ and exact meter-aware bar sizes', () => {
    expect(TICKS_PER_QUARTER).toBe(960);
    expect(ticksPerBar({ numerator: 4, denominator: 4 })).toBe(3840);
    expect(ticksPerBar({ numerator: 3, denominator: 4 })).toBe(2880);
    expect(ticksPerBar({ numerator: 6, denominator: 8 })).toBe(2880);
    expect(ticksPerBar({ numerator: 12, denominator: 8 })).toBe(5760);
    expect(ticksPerBar({ numerator: 3, denominator: 2 })).toBe(5760);
    expect(ticksPerMeterBeat({ numerator: 6, denominator: 8 })).toBe(480);
  });

  it('round-trips bar-beat-tick notation in compound meter', () => {
    const signature = { numerator: 6, denominator: 8 };
    const tick = barBeatTickToTicks({ bar: 3, beat: 4, tick: 120 }, signature);
    expect(tick).toBe(10680);
    expect(ticksToBarBeatTick(tick, signature)).toEqual({ bar: 3, beat: 4, tick: 120 });
    expect(formatBarBeatTick(tick, signature)).toBe('4 5 120');
    expect(parseBarBeatTick('4 5 120', signature)).toBe(tick);
    expect(parseBarBeatTick('4 7 0', signature)).toBeNull();
  });

  it('represents every supported subdivision and triplet exactly', () => {
    expect(noteValueToTicks(3)).toBe(1280);
    expect(noteValueToTicks(4)).toBe(960);
    expect(noteValueToTicks(6)).toBe(640);
    expect(noteValueToTicks(8)).toBe(480);
    expect(noteValueToTicks(12)).toBe(320);
    expect(noteValueToTicks(16)).toBe(240);
    expect(noteValueToTicks(24)).toBe(160);
    expect(noteValueToTicks(32)).toBe(120);
  });

  it('round-trips time on both sides of tempo boundaries', () => {
    const events = [
      { tick: toTimelineTick(0), bpm: 120 },
      { tick: toTimelineTick(3840), bpm: 60 },
      { tick: toTimelineTick(5760), bpm: 180 },
    ];

    expect(tickToSeconds(3840, events, 120)).toBeCloseTo(2);
    expect(tickToSeconds(5760, events, 120)).toBeCloseTo(4);
    expect(tickToSeconds(6720, events, 120)).toBeCloseTo(4 + 1 / 3);

    for (const tick of [0, 3839, 3840, 3841, 5759, 5760, 6720]) {
      expect(secondsToTick(tickToSeconds(tick, events, 120), events, 120)).toBe(tick);
    }
  });
});
