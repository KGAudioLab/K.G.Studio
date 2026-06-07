import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteTrackTool } from './DeleteTrackTool';
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

describe('DeleteTrackTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      removeTrackSynth: vi.fn(),
      removeTrackAudioPlayerBus: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('deletes a MIDI track by track_id', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('delete-by-id-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_id: '1' });

    expect(result).toEqual({
      success: true,
      result: 'Track deleted:\ntrack_id: 1\ntrack_name: Lead',
    });
    expect(project.getTracks().map(track => track.getName())).toEqual(['Bass']);
    expect(tool.buildToolResultDisplayContent({ track_id: '1' }, result)).toBe(
      'Track deleted:\n- track_id: 1\n- track_name: Lead',
    );
  });

  it('deletes a MIDI track by numeric track_id', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('delete-by-numeric-id-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_id: 1 });

    expect(result).toEqual({
      success: true,
      result: 'Track deleted:\ntrack_id: 1\ntrack_name: Lead',
    });
    expect(project.getTracks().map(track => track.getName())).toEqual(['Bass']);
    expect(tool.buildConfirmationContent({ track_id: 1 })).toBe('Allow deleting track ID **1**?');
  });

  it('deletes a MIDI track by track_name', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('delete-by-name-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_name: 'Bass' });

    expect(result).toEqual({
      success: true,
      result: 'Track deleted:\ntrack_id: 2\ntrack_name: Bass',
    });
    expect(project.getTracks().map(track => track.getName())).toEqual(['Lead']);
  });

  it('uses track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('delete-track-id-precedence-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({
      track_id: '2',
      track_name: 'Lead',
    });

    expect(result.success).toBe(true);
    expect(project.getTracks().map(track => track.getName())).toEqual(['Lead']);
  });

  it('uses numeric track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    const bassTrack = new KGMidiTrack('Bass', 2, 'acoustic_bass');
    const project = new KGProject('delete-numeric-track-id-precedence-project');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({
      track_id: 2,
      track_name: 'Lead',
    });

    expect(result.success).toBe(true);
    expect(project.getTracks().map(track => track.getName())).toEqual(['Lead']);
  });

  it('rejects duplicate track names when track_id is omitted', async () => {
    const firstLead = new KGMidiTrack('Lead', 1, 'trumpet');
    const secondLead = new KGMidiTrack('Lead', 2, 'flute');
    const project = new KGProject('delete-duplicate-name-project');
    project.setTracks([firstLead, secondLead]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_name: 'Lead' });

    expect(result).toEqual({
      success: false,
      result: 'Multiple MIDI tracks share the name "Lead". Provide track_id instead.',
    });
  });

  it('errors when neither identifier is provided', async () => {
    const project = new KGProject('delete-missing-id-project');
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({});

    expect(result).toEqual({
      success: false,
      result: 'Either track_id or track_name must be provided.',
    });
  });

  it('errors when the target track does not exist', async () => {
    const project = new KGProject('delete-missing-track-project');
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_id: '99' });

    expect(result).toEqual({
      success: false,
      result: 'Track with ID "99" not found or is not a MIDI track.',
    });
  });

  it('errors when the target is not a MIDI track', async () => {
    const audioTrack = new KGAudioTrack('Vocal', 1);
    const project = new KGProject('delete-audio-track-project');
    project.setTracks([audioTrack]);
    mockCore(project);

    const tool = new DeleteTrackTool();
    const result = await tool.execute({ track_id: '1' });

    expect(result).toEqual({
      success: false,
      result: 'Track with ID "1" not found or is not a MIDI track.',
    });
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('generates confirmation content only for valid target input', () => {
    const tool = new DeleteTrackTool();

    expect(tool.buildConfirmationContent({ track_id: '1' })).toBe('Allow deleting track ID **1**?');
    expect(tool.buildConfirmationContent({ track_name: 'Lead' })).toBe('Allow deleting track **Lead**?');
    expect(tool.buildConfirmationContent({})).toBeUndefined();
    expect(tool.buildConfirmationContent(null)).toBeUndefined();
  });

  it('does not generate display content for failed or malformed results', () => {
    const tool = new DeleteTrackTool();

    expect(tool.buildToolResultDisplayContent(
      { track_id: '1' },
      { success: false, result: 'Track with ID "1" not found or is not a MIDI track.' },
    )).toBeUndefined();

    expect(tool.buildToolResultDisplayContent(
      { track_id: '1' },
      { success: true, result: 'Track deleted.' },
    )).toBeUndefined();
  });
});
