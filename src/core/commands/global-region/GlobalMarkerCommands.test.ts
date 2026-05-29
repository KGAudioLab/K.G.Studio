import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGMarkerRegion } from '../../region/KGMarkerRegion';
import { CreateGlobalMarkerRegionCommand } from './CreateGlobalMarkerRegionCommand';
import { MoveGlobalRegionCommand } from './MoveGlobalRegionCommand';
import { ResizeGlobalRegionCommand } from './ResizeGlobalRegionCommand';
import { DeleteGlobalRegionCommand } from './DeleteGlobalRegionCommand';
import { UpdateGlobalRegionTextCommand } from './UpdateGlobalRegionTextCommand';

describe('global marker region commands', () => {
  beforeEach(() => {
    const project = new KGProject('Markers', 8, 0, 120);
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

  const getMarkerTrack = () => {
    const markerTrack = KGCore.instance().getCurrentProject().getGlobalTracks()
      .find(track => track.getType() === GlobalTrackType.Marker);

    if (!markerTrack) {
      throw new Error('Marker track missing in test setup');
    }

    return markerTrack;
  };

  it('creates a marker region clamped to the next marker start', () => {
    const markerTrack = getMarkerTrack();
    markerTrack.addRegion(new KGMarkerRegion('existing', markerTrack.getId(), markerTrack.getTrackIndex(), 'Verse', 10, 4));

    const command = new CreateGlobalMarkerRegionCommand(4, 32, 'Intro');
    command.execute();

    const created = command.getCreatedRegion();
    expect(created).not.toBeNull();
    expect(created?.getStartFromBeat()).toBe(4);
    expect(created?.getLength()).toBe(6);
  });

  it('moves a marker region with beat snapping and neighbor clamping', () => {
    const markerTrack = getMarkerTrack();
    const region = new KGMarkerRegion('middle', markerTrack.getId(), markerTrack.getTrackIndex(), 'Middle', 4, 2);
    markerTrack.setRegions([
      new KGMarkerRegion('left', markerTrack.getId(), markerTrack.getTrackIndex(), 'Left', 0, 4),
      region,
      new KGMarkerRegion('right', markerTrack.getId(), markerTrack.getTrackIndex(), 'Right', 10, 2),
    ]);

    const command = new MoveGlobalRegionCommand('middle', 9);
    command.execute();

    expect(region.getStartFromBeat()).toBe(8);

    command.undo();
    expect(region.getStartFromBeat()).toBe(4);
  });

  it('resizes a marker region with a minimum length of one beat', () => {
    const markerTrack = getMarkerTrack();
    const region = new KGMarkerRegion('marker', markerTrack.getId(), markerTrack.getTrackIndex(), 'Marker', 4, 4);
    markerTrack.setRegions([region]);

    const resizeStartCommand = new ResizeGlobalRegionCommand('marker', 'start', 7);
    resizeStartCommand.execute();
    expect(region.getStartFromBeat()).toBe(7);
    expect(region.getLength()).toBe(1);

    resizeStartCommand.undo();
    expect(region.getStartFromBeat()).toBe(4);
    expect(region.getLength()).toBe(4);

    const resizeEndCommand = new ResizeGlobalRegionCommand('marker', 'end', 5);
    resizeEndCommand.execute();
    expect(region.getLength()).toBe(1);
  });

  it('updates text and deletes with undo support', () => {
    const markerTrack = getMarkerTrack();
    const region = new KGMarkerRegion('marker', markerTrack.getId(), markerTrack.getTrackIndex(), 'Old', 0, 4);
    markerTrack.setRegions([region]);

    const renameCommand = new UpdateGlobalRegionTextCommand('marker', 'New');
    renameCommand.execute();
    expect(region.getName()).toBe('New');
    renameCommand.undo();
    expect(region.getName()).toBe('Old');

    const deleteCommand = new DeleteGlobalRegionCommand('marker');
    deleteCommand.execute();
    expect(markerTrack.getRegions()).toHaveLength(0);
    deleteCommand.undo();
    expect(markerTrack.getRegions()).toHaveLength(1);
    expect(markerTrack.getRegions()[0].getId()).toBe('marker');
  });
});
