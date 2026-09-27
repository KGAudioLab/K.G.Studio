import { describe, expect, it } from 'vitest';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { createMockMidiTrack } from '../test/utils/mock-data';
import { findBestOverlappingMidiRegion } from './chordRegionImportWorkflow';

function region(id: string, startBeat: number, length: number): KGMidiRegion {
  return new KGMidiRegion(id, '1', 0, id, startBeat, length);
}

describe('findBestOverlappingMidiRegion', () => {
  it('ignores regions that only touch the import boundaries', () => {
    const track = createMockMidiTrack({
      id: 1,
      regions: [region('left', 0, 4), region('right', 8, 4)],
    });

    expect(findBestOverlappingMidiRegion(track, 4, 4)).toBeNull();
  });

  it('selects the largest overlap', () => {
    const smaller = region('smaller', 2, 3);
    const larger = region('larger', 4, 6);
    const track = createMockMidiTrack({ id: 1, regions: [smaller, larger] });

    expect(findBestOverlappingMidiRegion(track, 3, 6)?.getId()).toBe('larger');
  });

  it('breaks equal-overlap ties by earliest start and then track order', () => {
    const later = region('later', 6, 2);
    const earliestFirst = region('earliest-first', 2, 2);
    const earliestSecond = region('earliest-second', 2, 2);
    const track = createMockMidiTrack({ id: 1, regions: [later, earliestFirst, earliestSecond] });

    expect(findBestOverlappingMidiRegion(track, 0, 10)?.getId()).toBe('earliest-first');
  });
});
