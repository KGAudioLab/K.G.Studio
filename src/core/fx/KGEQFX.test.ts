import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { clampEQBandFrequency, KGEQFX } from './KGEQFX';

describe('EQ band frequency order', () => {
  it('constrains only the edited band to its neighbors', () => {
    const frequencies = [200, 1350, 6500];
    expect(clampEQBandFrequency(frequencies, 0, 20000)).toBe(1349);
    expect(clampEQBandFrequency(frequencies, 1, 20)).toBe(201);
    expect(clampEQBandFrequency(frequencies, 1, 20000)).toBe(6499);
    expect(clampEQBandFrequency(frequencies, 2, 20)).toBe(1351);
    expect(clampEQBandFrequency(frequencies, 1, 3000)).toBe(3000);
    expect(frequencies).toEqual([200, 1350, 6500]);
  });
  it.each([[20000, 20, 20], [20000, 20000, 20000], [6500, 1350, 200]])('loads ordered bands from %s while keeping gain and Q attached', (a, b, c) => {
    const eq = plainToInstance(KGEQFX, { bands: [a, b, c].map((frequencyHz, index) => ({ frequencyHz, gainDb: index + 1, q: index + 1 })) });
    const bands = eq.getBands();
    expect(bands[0].frequencyHz).toBeGreaterThanOrEqual(20);
    expect(bands[0].frequencyHz).toBeLessThan(bands[1].frequencyHz);
    expect(bands[1].frequencyHz).toBeLessThan(bands[2].frequencyHz);
    expect(bands[2].frequencyHz).toBeLessThanOrEqual(20000);
    expect(bands.map(band => band.gainDb)).toEqual([1, 2, 3]);
    expect(bands.map(band => band.q)).toEqual([1, 2, 3]);
  });
});
