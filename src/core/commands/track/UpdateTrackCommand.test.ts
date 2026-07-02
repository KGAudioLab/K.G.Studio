import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { KGTrack } from '../../track/KGTrack';
import { UpdateTrackCommand } from './UpdateTrackCommand';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn(),
  },
}));

vi.mock('../../audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: vi.fn(),
  },
}));

describe('UpdateTrackCommand', () => {
  let track: KGTrack;
  let project: KGProject;
  const mockCore = {
    getCurrentProject: vi.fn(),
  };
  const mockAudioInterface = {
    setTrackVolume: vi.fn(),
    setTrackInstrument: vi.fn(),
    setTrackMute: vi.fn(),
    setTrackSolo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    track = new KGTrack('Track 1', 1);
    project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 11);
    mockCore.getCurrentProject.mockReturnValue(project);
    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
    vi.mocked(KGAudioInterface.instance).mockReturnValue(mockAudioInterface as unknown as KGAudioInterface);
  });

  it('updates muted state and propagates to the audio interface', () => {
    const command = new UpdateTrackCommand(1, { muted: true });

    command.execute();

    expect(track.getMuted()).toBe(true);
    expect(mockAudioInterface.setTrackMute).toHaveBeenCalledWith('1', true);
    expect(command.getChangedProperties()).toEqual(new Set(['muted']));
  });

  it('updates solo state and propagates to the audio interface', () => {
    const command = new UpdateTrackCommand(1, { solo: true });

    command.execute();

    expect(track.getSolo()).toBe(true);
    expect(mockAudioInterface.setTrackSolo).toHaveBeenCalledWith('1', true);
    expect(command.getChangedProperties()).toEqual(new Set(['solo']));
  });

  it('restores muted and solo state on undo', () => {
    track.setMuted(true);
    track.setSolo(true);
    const command = new UpdateTrackCommand(1, { muted: false, solo: false });

    command.execute();
    command.undo();

    expect(track.getMuted()).toBe(true);
    expect(track.getSolo()).toBe(true);
    expect(mockAudioInterface.setTrackMute).toHaveBeenLastCalledWith('1', true);
    expect(mockAudioInterface.setTrackSolo).toHaveBeenLastCalledWith('1', true);
  });

  it('treats unchanged mute and solo values as no-ops', () => {
    const command = new UpdateTrackCommand(1, { muted: false, solo: false });

    command.execute();

    expect(track.getMuted()).toBe(false);
    expect(track.getSolo()).toBe(false);
    expect(mockAudioInterface.setTrackMute).not.toHaveBeenCalled();
    expect(mockAudioInterface.setTrackSolo).not.toHaveBeenCalled();
    expect(command.getChangedProperties()).toEqual(new Set());
  });

  it('updates color and restores it on undo', () => {
    const command = new UpdateTrackCommand(1, { color: '#3C8AC4' });

    command.execute();

    expect(track.getColor()).toBe('#3C8AC4');
    expect(command.getChangedProperties()).toEqual(new Set(['color']));

    command.undo();

    expect(track.getColor()).toBeUndefined();
  });

  it('clears an existing color override', () => {
    track.setColor('#B43F1D');
    const command = new UpdateTrackCommand(1, { color: null });

    command.execute();

    expect(track.getColor()).toBeUndefined();
    expect(command.getChangedProperties()).toEqual(new Set(['color']));
  });
});
