import { describe, expect, it } from 'vitest';
import {
  buildEventListPlayheadAnchors,
  interpolateEventListPlayheadY,
  normalizeEventListPlayheadBeat,
} from './eventListPlayheadUtil';

describe('event list playhead interpolation', () => {
  it('uses the same tick precision shown by the Position column', () => {
    expect(normalizeEventListPlayheadBeat(4.0009, 480)).toBe(4);
    expect(normalizeEventListPlayheadBeat(4.0012, 480)).toBe(4 + (1 / 480));
  });

  it('interpolates proportionally between unevenly spaced positions', () => {
    const anchors = buildEventListPlayheadAnchors([
      { beat: 2, top: 20, bottom: 30 },
      { beat: 10, top: 40, bottom: 50 },
    ], 16, 0);

    expect(interpolateEventListPlayheadY(6, anchors)).toBe(30);
    expect(interpolateEventListPlayheadY(13, anchors)).toBe(45);
  });

  it('uses the first row top for a duplicate-position row group', () => {
    const anchors = buildEventListPlayheadAnchors([
      { beat: 4, top: 20, bottom: 30 },
      { beat: 4, top: 30, bottom: 40 },
      { beat: 8, top: 40, bottom: 50 },
    ], 16, 0);

    expect(anchors[1]).toEqual({ beat: 4, y: 20 });
    expect(interpolateEventListPlayheadY(4, anchors)).toBe(20);
  });

  it('keeps song start at the body top and song end at the last row bottom', () => {
    const anchors = buildEventListPlayheadAnchors([
      { beat: 0, top: 20, bottom: 30 },
      { beat: 16, top: 40, bottom: 50 },
    ], 16, 10);

    expect(anchors).toEqual([
      { beat: 0, y: 10 },
      { beat: 16, y: 50 },
    ]);
  });

  it('clamps playhead positions to the song range', () => {
    const anchors = buildEventListPlayheadAnchors([
      { beat: 8, top: 40, bottom: 50 },
    ], 16, 0);

    expect(interpolateEventListPlayheadY(-2, anchors)).toBe(0);
    expect(interpolateEventListPlayheadY(20, anchors)).toBe(50);
  });

  it('returns no anchors or playhead position for an empty visible table', () => {
    const anchors = buildEventListPlayheadAnchors([], 16, 0);

    expect(anchors).toEqual([]);
    expect(interpolateEventListPlayheadY(4, anchors)).toBeNull();
  });
});
