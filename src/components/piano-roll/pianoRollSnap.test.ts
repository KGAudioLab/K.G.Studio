import { describe, expect, it } from 'vitest';
import { PIANO_ROLL_NO_SNAP } from '../../core/state/KGPianoRollState';
import { getSnapStep } from './pianoRollSnap';

describe('pianoRollSnap', () => {
  it('returns null for the no-snap sentinel', () => {
    expect(getSnapStep(PIANO_ROLL_NO_SNAP)).toBeNull();
  });

  it('returns a beat step for fractional snap values', () => {
    expect(getSnapStep('1/4')).toBe(1);
    expect(getSnapStep('1/8')).toBe(0.5);
  });
});
