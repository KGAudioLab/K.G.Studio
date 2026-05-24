import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import { CreateTempoRegionCommand } from './CreateTempoRegionCommand';
import { DeleteTempoRegionCommand } from './DeleteTempoRegionCommand';
import { ResizeTempoRegionCommand } from './ResizeTempoRegionCommand';
import { UpdateTempoRegionCommand } from './UpdateTempoRegionCommand';

describe('global tempo region commands', () => {
  beforeEach(() => {
    const project = new KGProject('Tempo', 8, 0, 120);
    const mockCore = KGCore.instance() as unknown as {
      getCurrentProject: ReturnType<typeof vi.fn>;
    };

    mockCore.getCurrentProject.mockReturnValue(project);
  });

  const getTempoTrack = () => {
    const tempoTrack = KGCore.instance().getCurrentProject().getGlobalTracks()
      .find(track => track.getType() === GlobalTrackType.Tempo);

    if (!tempoTrack) {
      throw new Error('Tempo track missing in test setup');
    }

    return tempoTrack;
  };

  it('creates the first explicit region as full-song coverage', () => {
    const command = new CreateTempoRegionCommand(3);
    command.execute();

    const tempoTrack = getTempoTrack();
    const regions = tempoTrack.getRegions() as KGTempoRegion[];

    expect(regions).toHaveLength(1);
    expect(regions[0].getStartBar()).toBe(0);
    expect(regions[0].getLengthBars()).toBe(8);
    expect(regions[0].getBpm()).toBe(120);
  });

  it('creates additional regions by splitting the covered span and inheriting BPM', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('left', tempoTrack.getId(), tempoTrack.getTrackIndex(), 128, 0, 8, 4),
    ]);

    const command = new CreateTempoRegionCommand(5);
    command.execute();

    const regions = tempoTrack.getRegions() as KGTempoRegion[];
    expect(regions).toHaveLength(2);
    expect(regions[0].getLengthBars()).toBe(5);
    expect(regions[1].getStartBar()).toBe(5);
    expect(regions[1].getLengthBars()).toBe(3);
    expect(regions[1].getBpm()).toBe(128);
  });

  it('resizes a shared boundary and keeps the track gapless', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('left', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 4, 4),
      new KGTempoRegion('right', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 4, 4, 4),
    ]);

    const command = new ResizeTempoRegionCommand('left', 'end', 6);
    command.execute();

    const regions = tempoTrack.getRegions() as KGTempoRegion[];
    expect(regions[0].getLengthBars()).toBe(6);
    expect(regions[1].getStartBar()).toBe(6);
    expect(regions[1].getLengthBars()).toBe(2);
  });

  it('deletes a middle region by extending the previous region', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('first', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('middle', tempoTrack.getId(), tempoTrack.getTrackIndex(), 128, 2, 3, 4),
      new KGTempoRegion('last', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 5, 3, 4),
    ]);

    const command = new DeleteTempoRegionCommand('middle');
    command.execute();

    const regions = tempoTrack.getRegions() as KGTempoRegion[];
    expect(regions).toHaveLength(2);
    expect(regions[0].getLengthBars()).toBe(5);
    expect(regions[1].getStartBar()).toBe(5);
  });

  it('allows deleting the last remaining region', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('only', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);

    const command = new DeleteTempoRegionCommand('only');
    command.execute();

    expect(tempoTrack.getRegions()).toHaveLength(0);
    command.undo();
    expect(tempoTrack.getRegions()).toHaveLength(1);
  });

  it('updates the region tempo with undo support', () => {
    const tempoTrack = getTempoTrack();
    tempoTrack.setRegions([
      new KGTempoRegion('region', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);

    const command = new UpdateTempoRegionCommand('region', 150);
    command.execute();
    expect((tempoTrack.getRegions()[0] as KGTempoRegion).getBpm()).toBe(150);
    command.undo();
    expect((tempoTrack.getRegions()[0] as KGTempoRegion).getBpm()).toBe(120);
  });
});
