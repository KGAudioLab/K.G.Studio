import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListAllTracksTool } from './ListAllTracksTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';

function mockCore(project: KGProject) {
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project,
  } as unknown as KGCore);
}

describe('ListAllTracksTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists all MIDI tracks with English instrument names', async () => {
    const lead = new KGMidiTrack('Lead', 1, 'acoustic_grand_piano');
    const bass = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    const audio = new KGAudioTrack('Vocal', 3);
    lead.setTrackIndex(0);
    bass.setTrackIndex(1);
    audio.setTrackIndex(2);

    const project = new KGProject('track-list-project');
    project.setTracks([lead, bass, audio]);
    mockCore(project);

    const tool = new ListAllTracksTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe(
      'track_id: 1\ntrack_name: Lead\ninstrument: Acoustic Grand Piano\n\ntrack_id: 2\ntrack_name: Bass\ninstrument: Electric Bass (finger)',
    );
  });

  it('returns a friendly message when there are no MIDI tracks', async () => {
    const project = new KGProject('no-midi-tracks');
    project.setTracks([new KGAudioTrack('Mixdown', 1)]);
    mockCore(project);

    const tool = new ListAllTracksTool();
    const result = await tool.execute({});

    expect(result).toEqual({
      success: true,
      result: 'No MIDI tracks found.',
    });
  });
});
