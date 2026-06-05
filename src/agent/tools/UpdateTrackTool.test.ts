import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateTrackTool } from './UpdateTrackTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';

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

describe('UpdateTrackTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      setTrackInstrument: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('renames a track by track_id', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('rename-track-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: 'Lead 2',
    });

    expect(result).toEqual({
      success: true,
      result: 'Track updated:\ntrack_id: 1\ntrack_name: Lead 2\ninstrument: Trumpet',
    });
    expect(track.getName()).toBe('Lead 2');
    expect(tool.buildToolResultDisplayContent({
      track_id: '1',
      new_track_name: 'Lead 2',
    }, result)).toBe(
      'Track updated:\n- track_id: 1\n- track_name: Lead 2\n- instrument: Trumpet',
    );
  });

  it('updates a track instrument by track_name', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('instrument-track-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_name: 'Lead',
      instrument: 'Flute',
    });

    expect(result).toEqual({
      success: true,
      result: 'Track updated:\ntrack_id: 1\ntrack_name: Lead\ninstrument: Flute',
    });
    expect(track.getInstrument()).toBe('flute');
  });

  it('updates both track name and instrument', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('rename-and-instrument-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: 'Flute Lead',
      instrument: 'Flute',
    });

    expect(result).toEqual({
      success: true,
      result: 'Track updated:\ntrack_id: 1\ntrack_name: Flute Lead\ninstrument: Flute',
    });
    expect(track.getName()).toBe('Flute Lead');
    expect(track.getInstrument()).toBe('flute');
  });

  it('uses track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('track-id-precedence-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '2',
      track_name: 'Lead',
      new_track_name: 'Bass 2',
    });

    expect(result.success).toBe(true);
    expect(leadTrack.getName()).toBe('Lead');
    expect(bassTrack.getName()).toBe('Bass 2');
  });

  it('rejects duplicate track names when track_id is omitted', async () => {
    const firstLead = new KGMidiTrack('Lead', 1, 'trumpet');
    const secondLead = new KGMidiTrack('Lead', 2, 'flute');
    const project = new KGProject('duplicate-name-project');
    project.setTracks([firstLead, secondLead]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_name: 'Lead',
      new_track_name: 'Lead 2',
    });

    expect(result).toEqual({
      success: false,
      result: 'Multiple MIDI tracks share the name "Lead". Provide track_id instead.',
    });
  });

  it('returns an error when neither identifier is provided', async () => {
    const project = new KGProject('missing-id-project');
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      new_track_name: 'Lead 2',
    });

    expect(result).toEqual({
      success: false,
      result: 'Either track_id or track_name must be provided.',
    });
  });

  it('returns an error when no update fields are provided', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('missing-fields-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
    });

    expect(result).toEqual({
      success: false,
      result: 'At least one of instrument or new_track_name must be provided.',
    });
  });

  it('treats empty string optional fields as not provided', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('empty-string-fields-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: '',
      instrument: '',
    });

    expect(result).toEqual({
      success: false,
      result: 'At least one of instrument or new_track_name must be provided.',
    });
    expect(tool.buildConfirmationContent({
      track_id: '1',
      new_track_name: '',
      instrument: '',
    })).toBeUndefined();
  });

  it('treats null optional fields as not provided', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('null-fields-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: null,
      instrument: null,
    });

    expect(result).toEqual({
      success: false,
      result: 'At least one of instrument or new_track_name must be provided.',
    });
  });

  it('applies a valid change when the other optional field is empty', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('mixed-empty-field-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: '',
      instrument: 'Flute',
    });

    expect(result).toEqual({
      success: true,
      result: 'Track updated:\ntrack_id: 1\ntrack_name: Lead\ninstrument: Flute',
    });
    expect(track.getInstrument()).toBe('flute');
    expect(tool.buildConfirmationContent({
      track_id: '1',
      new_track_name: '',
      instrument: 'Flute',
    })).toBe('Allow updating track ID **1** to set instrument to **Flute**?');
  });

  it('returns an error when provided values do not change the track', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('unchanged-values-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: 'Lead',
      instrument: 'Trumpet',
    });

    expect(result).toEqual({
      success: false,
      result: 'No changes to apply to the target track.',
    });
  });

  it('returns an error for an invalid instrument', async () => {
    const track = new KGMidiTrack('Lead', 1, 'trumpet');
    const project = new KGProject('invalid-instrument-project');
    project.setTracks([track]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      instrument: 'trumpet',
    });

    expect(result).toEqual({
      success: false,
      result: 'Invalid instrument "trumpet". Use the exact English name from list_all_available_instruments.',
    });
  });

  it('returns an error when the track does not exist', async () => {
    const project = new KGProject('missing-track-project');
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '99',
      new_track_name: 'Lead 2',
    });

    expect(result).toEqual({
      success: false,
      result: 'Track with ID "99" not found or is not a MIDI track.',
    });
  });

  it('returns an error when the target is not a MIDI track', async () => {
    const audioTrack = new KGAudioTrack('Vocal', 1);
    const project = new KGProject('audio-track-project');
    project.setTracks([audioTrack]);
    mockCore(project);

    const tool = new UpdateTrackTool();
    const result = await tool.execute({
      track_id: '1',
      new_track_name: 'Vocal 2',
    });

    expect(result).toEqual({
      success: false,
      result: 'Track with ID "1" not found or is not a MIDI track.',
    });
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });
});
