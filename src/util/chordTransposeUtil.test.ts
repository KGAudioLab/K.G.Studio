import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { GlobalTrackType } from '../core/global-track';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { buildChordTransposePlan, hasChordRegionsInRange, transposeChordSymbol } from './chordTransposeUtil';

describe('chord transpose utilities', () => {
  it('keeps chord quality and extensions while using the target key spelling', () => {
    expect(transposeChordSymbol('Cmaj7', 2, 'D major')).toBe('Dmaj7');
    expect(transposeChordSymbol('C7', 5, 'F major')).toBe('F7');
    expect(transposeChordSymbol('F#m7b5', 1, 'F major')).toBe('Gm7b5');
    expect(transposeChordSymbol('C', 1, 'F major')).toBe('Db');
  });

  it('detects overlap and splits a partially covered chord without changing the rest', () => {
    const project = new KGProject('Chords');
    const chordTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Chord)!;
    chordTrack.setRegions([
      new KGChordRegion('chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'Cmaj7', 0, 8),
    ]);

    expect(hasChordRegionsInRange(project, { startTick: 2, endTick: 6 })).toBe(true);
    expect(hasChordRegionsInRange(project, { startTick: 8, endTick: 10 })).toBe(false);

    const plan = buildChordTransposePlan(project, 2, 'D major', { startTick: 2, endTick: 6 });
    plan.apply();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => ({
      symbol: region.getSymbol(),
      start: region.getStartTick(),
      length: region.getLengthTicks(),
    }))).toEqual([
      { symbol: 'Cmaj7', start: 0, length: 2 },
      { symbol: 'Dmaj7', start: 2, length: 4 },
      { symbol: 'Cmaj7', start: 6, length: 2 },
    ]);

    plan.undo();
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => ({
      id: region.getId(),
      symbol: region.getSymbol(),
      start: region.getStartTick(),
      length: region.getLengthTicks(),
    }))).toEqual([{ id: 'chord', symbol: 'Cmaj7', start: 0, length: 8 }]);
  });
});
