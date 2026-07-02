import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGTrack } from '../../track/KGTrack';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { UpdateRegionCommand } from './UpdateRegionCommand';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn(),
  },
}));

describe('UpdateRegionCommand', () => {
  let track: KGTrack;
  let region: KGMidiRegion;
  let project: KGProject;
  const mockCore = {
    getCurrentProject: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    track = new KGTrack('Track 1', 1);
    region = new KGMidiRegion('region-1', '1', 0, 'Verse', 0, 4);
    track.setRegions([region]);
    project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 11);
    mockCore.getCurrentProject.mockReturnValue(project);
    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('updates color and restores it on undo', () => {
    const command = new UpdateRegionCommand('region-1', { color: '#3D77C9' });

    command.execute();

    expect(region.getColor()).toBe('#3D77C9');
    expect(command.getChangedProperties()).toEqual(new Set(['color']));

    command.undo();

    expect(region.getColor()).toBeUndefined();
  });

  it('clears an existing region color override', () => {
    region.setColor('#B43F1D');
    const command = new UpdateRegionCommand('region-1', { color: null });

    command.execute();

    expect(region.getColor()).toBeUndefined();
    expect(command.getChangedProperties()).toEqual(new Set(['color']));
  });
});
