import { describe, expect, it } from 'vitest';
import { createPreviewBands, previewResponseDb } from './eqPreview';

describe('EQ shelf and bell curves', () => {
  it('remains flat at zero gain', () => {
    for (const frequency of [20, 200, 1350, 6500, 20000]) expect(previewResponseDb(createPreviewBands(), frequency)).toBeCloseTo(0, 8);
  });
  it.each([12, -12])('applies a low shelf at %s dB to the left of band 1', gain => {
    const bands = createPreviewBands(); bands[0].gain = gain;
    expect(previewResponseDb(bands, 20)).toBeCloseTo(gain, 1);
    expect(previewResponseDb(bands, bands[0].frequency)).toBeCloseTo(gain / 2, 6);
    expect(previewResponseDb(bands, 20000)).toBeCloseTo(0, 6);
    const before = previewResponseDb(bands, 100); bands[0].q = 10;
    expect(previewResponseDb(bands, 100)).toBe(before);
  });
  it.each([12, -12])('applies a high shelf at %s dB to the right of band 3', gain => {
    const bands = createPreviewBands(); bands[2].gain = gain;
    expect(previewResponseDb(bands, 20)).toBeCloseTo(0, 6);
    expect(previewResponseDb(bands, bands[2].frequency)).toBeCloseTo(gain / 2, 6);
    expect(previewResponseDb(bands, 20000)).toBeCloseTo(gain, 1);
    const before = previewResponseDb(bands, 8000); bands[2].q = 10;
    expect(previewResponseDb(bands, 8000)).toBe(before);
  });
  it('keeps the middle band as a bell with adjustable Q', () => {
    const bands = createPreviewBands(); bands[1].gain = 12;
    expect(previewResponseDb(bands, bands[1].frequency)).toBeCloseTo(12, 6);
    expect(previewResponseDb(bands, 20)).toBeCloseTo(0, 1);
    expect(previewResponseDb(bands, 20000)).toBeCloseTo(0, 1);
    const wide = previewResponseDb(bands, 700); bands[1].q = 10;
    expect(previewResponseDb(bands, 700)).toBeLessThan(wide);
  });
});
