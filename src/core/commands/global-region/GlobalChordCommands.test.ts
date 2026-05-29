import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { CreateChordRegionCommand } from './CreateChordRegionCommand';
import { InsertChordRegionAtBeatCommand } from './InsertChordRegionAtBeatCommand';
import { MoveGlobalRegionCommand } from './MoveGlobalRegionCommand';
import { ReplaceChordRegionsInRangeCommand } from './ReplaceChordRegionsInRangeCommand';
import { ResizeGlobalRegionCommand } from './ResizeGlobalRegionCommand';
import { UpdateChordRegionCommand } from './UpdateChordRegionCommand';

describe('global chord region commands', () => {
  beforeEach(() => {
    const project = new KGProject('Chords', 8, 0, 120);
    const mockCore = KGCore.instance() as unknown as {
      getCurrentProject: ReturnType<typeof vi.fn>;
      getSelectedItems: ReturnType<typeof vi.fn>;
      removeSelectedItem?: ReturnType<typeof vi.fn>;
    };

    mockCore.getCurrentProject.mockReturnValue(project);
    mockCore.getSelectedItems.mockReturnValue([]);
    if (!mockCore.removeSelectedItem) {
      mockCore.removeSelectedItem = vi.fn();
    } else {
      mockCore.removeSelectedItem.mockReset();
    }
  });

  const getChordTrack = () => {
    const chordTrack = KGCore.instance().getCurrentProject().getGlobalTracks()
      .find(track => track.getType() === GlobalTrackType.Chord);

    if (!chordTrack) {
      throw new Error('Chord track missing in test setup');
    }

    return chordTrack;
  };

  it('creates a chord region with a default one-bar length clamped by the next region', () => {
    const chordTrack = getChordTrack();
    chordTrack.addRegion(new KGChordRegion('existing', chordTrack.getId(), chordTrack.getTrackIndex(), 'Fmaj7', 6, 2));

    const command = new CreateChordRegionCommand(4, 4, 'Cmaj7');
    command.execute();

    const created = command.getCreatedRegion();
    expect(created?.getStartFromBeat()).toBe(4);
    expect(created?.getLength()).toBe(2);
  });

  it('moves and resizes chord regions with beat snapping and no overlap', () => {
    const chordTrack = getChordTrack();
    const region = new KGChordRegion('middle', chordTrack.getId(), chordTrack.getTrackIndex(), 'Dm7', 4, 2);
    chordTrack.setRegions([
      new KGChordRegion('left', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
      region,
      new KGChordRegion('right', chordTrack.getId(), chordTrack.getTrackIndex(), 'G7', 10, 2),
    ]);

    const moveCommand = new MoveGlobalRegionCommand('middle', 9);
    moveCommand.execute();
    expect(region.getStartFromBeat()).toBe(8);

    const resizeCommand = new ResizeGlobalRegionCommand('middle', 'end', 12);
    resizeCommand.execute();
    expect(region.getLength()).toBe(2);

    const resizeMinCommand = new ResizeGlobalRegionCommand('middle', 'start', 9);
    resizeMinCommand.execute();
    expect(region.getStartFromBeat()).toBe(9);
    expect(region.getLength()).toBe(1);
  });

  it('updates chord symbols with undo support', () => {
    const chordTrack = getChordTrack();
    const region = new KGChordRegion('chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4);
    chordTrack.setRegions([region]);

    const command = new UpdateChordRegionCommand('chord', 'Bm7b5');
    command.execute();
    expect(region.getSymbol()).toBe('Bm7b5');

    command.undo();
    expect(region.getSymbol()).toBe('C');
  });

  it('inserts a new chord inside an existing region and shortens the original', () => {
    const chordTrack = getChordTrack();
    const region = new KGChordRegion('chord', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 8);
    chordTrack.setRegions([region]);

    const command = new InsertChordRegionAtBeatCommand(3, 'C');
    command.execute();

    const created = command.getCreatedRegion();
    expect(created).not.toBeNull();
    expect(region.getLength()).toBe(3);
    expect(created?.getStartFromBeat()).toBe(3);
    expect(created?.getLength()).toBe(5);

    command.undo();
    expect(chordTrack.getRegions()).toHaveLength(1);
    expect(region.getLength()).toBe(8);
  });

  it('replaces only the requested chord span and restores the original layout on undo', () => {
    const chordTrack = getChordTrack();
    chordTrack.setRegions([
      new KGChordRegion('left', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
      new KGChordRegion('middle', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 4, 4),
      new KGChordRegion('right', chordTrack.getId(), chordTrack.getTrackIndex(), 'F', 8, 4),
    ]);

    const command = new ReplaceChordRegionsInRangeCommand(2, 10, [
      { startBeat: 2, length: 2, symbol: 'Dm' },
      { startBeat: 4, length: 4, symbol: 'E' },
      { startBeat: 8, length: 2, symbol: 'Am' },
    ]);

    command.execute();

    const replacedRegions = getChordTrack().getRegions() as KGChordRegion[];
    expect(replacedRegions.map(region => ({
      symbol: region.getSymbol(),
      start: region.getStartFromBeat(),
      length: region.getLength(),
    }))).toEqual([
      { symbol: 'C', start: 0, length: 2 },
      { symbol: 'Dm', start: 2, length: 2 },
      { symbol: 'E', start: 4, length: 4 },
      { symbol: 'Am', start: 8, length: 2 },
      { symbol: 'F', start: 10, length: 2 },
    ]);

    command.undo();
    const restoredRegions = getChordTrack().getRegions() as KGChordRegion[];
    expect(restoredRegions.map(region => ({
      symbol: region.getSymbol(),
      start: region.getStartFromBeat(),
      length: region.getLength(),
    }))).toEqual([
      { symbol: 'C', start: 0, length: 4 },
      { symbol: 'Am', start: 4, length: 4 },
      { symbol: 'F', start: 8, length: 4 },
    ]);
  });
});
