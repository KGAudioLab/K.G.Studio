import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddTrackCommand } from './AddTrackCommand';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

describe('AddTrackCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      createTrackSynth: vi.fn(),
      removeTrackSynth: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('appends a track when no insertion index is provided', () => {
    const firstTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    secondTrack.setTrackIndex(1);
    const project = new KGProject('append-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddTrackCommand(undefined, 'Pad', 'string_ensemble_1');
    command.execute();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Lead', 'Bass', 'Pad']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1, 2]);
    expect(command.getCreatedTrack()?.getTrackIndex()).toBe(2);
  });

  it('inserts a track at the requested index and reindexes every track', () => {
    const firstTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    secondTrack.setTrackIndex(1);
    const project = new KGProject('insert-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddTrackCommand(undefined, 'Pad', 'string_ensemble_1', 1);
    command.execute();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Lead', 'Pad', 'Bass']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1, 2]);
    expect(command.getCreatedTrack()?.getTrackIndex()).toBe(1);
  });

  it('undoes an inserted track cleanly and restores contiguous indices', () => {
    const firstTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    secondTrack.setTrackIndex(1);
    const project = new KGProject('undo-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddTrackCommand(undefined, 'Pad', 'string_ensemble_1', 1);
    command.execute();
    command.undo();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Lead', 'Bass']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1]);
  });
});
