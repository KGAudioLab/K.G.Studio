import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewTrackTool } from './CreateNewTrackTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeRegionId: null,
      selectedRegionIds: [],
      selectedTrackId: null,
    }),
  },
}));

function mockCore(project: KGProject) {
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project,
    executeCommand: (command: { execute(): void }) => command.execute(),
  } as unknown as KGCore);
}

describe('CreateNewTrackTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      createTrackSynth: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('creates a new track and returns the exact output shape', async () => {
    const project = new KGProject('create-track-project');
    project.setTracks([new KGMidiTrack('Lead', 1, 'trumpet')]);
    mockCore(project);

    const tool = new CreateNewTrackTool();
    const result = await tool.execute({
      track_name: 'Bass',
      instrument: 'Electric Bass (finger)',
    });

    expect(result).toEqual({
      success: true,
      result: 'New track created:\ntrack_id: 2\ntrack_name: Bass\ninstrument: Electric Bass (finger)',
    });
    expect(project.getTracks()).toHaveLength(2);
    expect(project.getTracks()[1]).toBeInstanceOf(KGMidiTrack);
    expect((project.getTracks()[1] as KGMidiTrack).getInstrument()).toBe('electric_bass_finger');
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(tool.buildToolResultDisplayContent({
      track_name: 'Bass',
      instrument: 'Electric Bass (finger)',
    }, result)).toBe(
      'New track created:\n- track_id: 2\n- track_name: Bass\n- instrument: Electric Bass (finger)',
    );
  });

  it('rejects an invalid instrument name', async () => {
    const project = new KGProject('invalid-instrument-project');
    mockCore(project);

    const tool = new CreateNewTrackTool();
    const result = await tool.execute({
      track_name: 'Bass',
      instrument: 'electric_bass_finger',
    });

    expect(result).toEqual({
      success: false,
      result: 'Invalid instrument "electric_bass_finger". Use the exact English name from list_all_available_instruments.',
    });
    expect(project.getTracks()).toHaveLength(0);
  });
});
