import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateNewTrackTool } from './CreateNewTrackTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';

const mockedStoreState = vi.hoisted(() => ({
  selectedTrackId: null as string | null,
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeRegionId: null,
      selectedRegionIds: [],
      selectedTrackId: mockedStoreState.selectedTrackId,
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
    mockedStoreState.selectedTrackId = null;
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      createTrackSynth: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('creates a new track and returns the exact output shape', async () => {
    const project = new KGProject('create-track-project');
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    leadTrack.setTrackIndex(0);
    project.setTracks([leadTrack]);
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

  it('inserts the new track below the selected track', async () => {
    const project = new KGProject('selected-track-project');
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    leadTrack.setTrackIndex(0);
    const bassTrack = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    bassTrack.setTrackIndex(1);
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);
    mockedStoreState.selectedTrackId = '1';

    const tool = new CreateNewTrackTool();
    const result = await tool.execute({
      track_name: 'Pad',
      instrument: 'Electric Bass (finger)',
    });

    expect(result.success).toBe(true);
    expect(project.getTracks().map(track => track.getName())).toEqual(['Lead', 'Pad', 'Bass']);
    expect(project.getTracks().map(track => track.getTrackIndex())).toEqual([0, 1, 2]);
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
