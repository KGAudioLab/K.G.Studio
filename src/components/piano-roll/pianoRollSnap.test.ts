import { describe, expect, it } from 'vitest';
import { PIANO_ROLL_NO_SNAP } from '../../core/state/KGPianoRollState';
import {
  getNoteValueStepTicks,
  getSnapStepTicks,
  quantizeTickLength,
  quantizeTickPosition,
} from './pianoRollSnap';
import { TICKS_PER_QUARTER } from '../../core/timing';

describe('pianoRollSnap', () => {
  it('returns null for the no-snap sentinel', () => {
    expect(getSnapStepTicks(PIANO_ROLL_NO_SNAP)).toBeNull();
  });

  it('returns an integer tick step for fractional snap values', () => {
    expect(getSnapStepTicks('1/4')).toBe(TICKS_PER_QUARTER);
    expect(getSnapStepTicks('1/8')).toBe(TICKS_PER_QUARTER / 2);
  });

  it('converts piano-roll quantize values to tick steps', () => {
    expect(getNoteValueStepTicks('1/1')).toBe(TICKS_PER_QUARTER * 4);
    expect(getNoteValueStepTicks('1/4')).toBe(TICKS_PER_QUARTER);
    expect(getNoteValueStepTicks('1/8')).toBe(TICKS_PER_QUARTER / 2);
    expect(getNoteValueStepTicks('1/32')).toBe(TICKS_PER_QUARTER / 8);
  });

  it('rejects malformed quantize values', () => {
    expect(getNoteValueStepTicks('none')).toBeNull();
    expect(getNoteValueStepTicks('1/0')).toBeNull();
    expect(getNoteValueStepTicks('2/4')).toBeNull();
  });

  it('quantizes note positions using tick-sized note values', () => {
    expect(quantizeTickPosition(700, '1/8')).toBe(480);
    expect(quantizeTickPosition(700, '1/4')).toBe(960);
  });

  it('quantizes note lengths using tick-sized note values', () => {
    expect(quantizeTickLength(700, '1/8', 15)).toBe(480);
    expect(quantizeTickLength(200, '1/8', 15)).toBe(480);
  });
});
