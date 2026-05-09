import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGTrack } from '../../track/KGTrack';
import { CreateTrackAutomationPointsCommand } from './CreateTrackAutomationPointsCommand';
import { DeleteTrackAutomationPointsCommand } from './DeleteTrackAutomationPointsCommand';
import { UpdateTrackAutomationPointsCommand } from './UpdateTrackAutomationPointsCommand';
import { KGTrackAutomationPoint } from '../../track/KGTrackAutomationPoint';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn()
  }
}));

describe('track automation commands', () => {
  let track: KGTrack;
  let project: KGProject;
  const mockCore = {
    getCurrentProject: vi.fn(),
    getSelectedItems: vi.fn(() => []),
    removeSelectedItem: vi.fn(),
  };

  beforeEach(() => {
    track = new KGTrack('Track 1', 1);
    project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 10);
    mockCore.getCurrentProject.mockReturnValue(project);
    mockCore.getSelectedItems.mockReturnValue([]);
    mockCore.removeSelectedItem.mockReset();
    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('creates and dedupes same-beat automation points', () => {
    const command = new CreateTrackAutomationPointsCommand(1, 'volume', [
      { beat: 1, value: -6, pointId: 'point-1' },
      { beat: 1, value: -3, pointId: 'point-2' },
    ]);

    command.execute();

    expect(track.getVolumeAutomation()).toHaveLength(1);
    expect(track.getVolumeAutomation()[0].getId()).toBe('point-2');
    expect(track.getVolumeAutomation()[0].getValue()).toBe(-3);
  });

  it('restores deleted automation points on undo', () => {
    track.setPanAutomation([
      new KGTrackAutomationPoint('point-1', 1, -0.5),
      new KGTrackAutomationPoint('point-2', 2, 0.5),
    ]);
    const command = new DeleteTrackAutomationPointsCommand(1, 'pan', ['point-1']);

    command.execute();
    expect(track.getPanAutomation()).toHaveLength(1);

    command.undo();
    expect(track.getPanAutomation()).toHaveLength(2);
  });

  it('updates points and removes collisions caused by moves', () => {
    track.setPanAutomation([
      new KGTrackAutomationPoint('point-1', 1, -0.5),
      new KGTrackAutomationPoint('point-2', 2, 0.5),
    ]);
    const command = new UpdateTrackAutomationPointsCommand(
      1,
      'pan',
      [
        { pointId: 'point-1', beat: 1, value: -0.5 },
        { pointId: 'point-2', beat: 2, value: 0.5 },
      ],
      [
        { pointId: 'point-1', beat: 2, value: -0.25 },
      ]
    );

    command.execute();

    expect(track.getPanAutomation()).toHaveLength(1);
    expect(track.getPanAutomation()[0].getId()).toBe('point-2');

    command.undo();
    expect(track.getPanAutomation()).toHaveLength(2);
  });
});
