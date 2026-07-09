import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddAudioTrackCommand } from './AddAudioTrackCommand';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

describe('AddAudioTrackCommand', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue({
      createTrackAudioPlayerBus: vi.fn(),
      removeTrackAudioPlayerBus: vi.fn(),
    } as unknown as KGAudioInterface);
  });

  it('appends an audio track when no insertion index is provided', () => {
    const firstTrack = new KGAudioTrack('Audio 1', 1);
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGAudioTrack('Audio 2', 2);
    secondTrack.setTrackIndex(1);
    const project = new KGProject('append-audio-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddAudioTrackCommand(undefined, 'Audio 3');
    command.execute();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Audio 1', 'Audio 2', 'Audio 3']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1, 2]);
    expect(command.getCreatedTrack()?.getTrackIndex()).toBe(2);
  });

  it('inserts an audio track at the requested index and reindexes every track', () => {
    const firstTrack = new KGAudioTrack('Audio 1', 1);
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGAudioTrack('Audio 2', 2);
    secondTrack.setTrackIndex(1);
    const project = new KGProject('insert-audio-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddAudioTrackCommand(undefined, 'Audio 3', 1);
    command.execute();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Audio 1', 'Audio 3', 'Audio 2']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1, 2]);
    expect(command.getCreatedTrack()?.getTrackIndex()).toBe(1);
  });

  it('undoes an inserted audio track cleanly and restores contiguous indices', () => {
    const firstTrack = new KGAudioTrack('Audio 1', 1);
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGAudioTrack('Audio 2', 2);
    secondTrack.setTrackIndex(1);
    const project = new KGProject('undo-audio-project');
    project.setTracks([firstTrack, secondTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const command = new AddAudioTrackCommand(undefined, 'Audio 3', 1);
    command.execute();
    command.undo();

    const tracks = project.getTracks();
    expect(tracks.map(track => track.getName())).toEqual(['Audio 1', 'Audio 2']);
    expect(tracks.map(track => track.getTrackIndex())).toEqual([0, 1]);
  });
});
