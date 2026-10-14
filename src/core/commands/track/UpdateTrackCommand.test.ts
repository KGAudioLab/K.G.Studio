import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { KGMidiTrack } from '../../track/KGMidiTrack';
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
    setTrackPan: vi.fn(),
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

  it('updates base pan, preserves automation, and restores audio on undo/redo', () => {
    const command = new UpdateTrackCommand(1, { pan: -0.25 });
    command.execute();
    expect(track.getPan()).toBe(-0.25);
    expect(mockAudioInterface.setTrackPan).toHaveBeenLastCalledWith('1', -0.25);
    expect(command.getChangedProperties()).toEqual(new Set(['pan']));
    expect(command.getDescription()).toContain('pan');
    command.undo();
    expect(track.getPan()).toBe(0);
    expect(mockAudioInterface.setTrackPan).toHaveBeenLastCalledWith('1', 0);
    command.execute();
    expect(track.getPan()).toBe(-0.25);
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
  it('updates images with undo/redo and supports returning to default', () => {
    const command = new UpdateTrackCommand(1, { imageName: 'violin.png' });
    command.execute();
    expect(track.getImageName()).toBe('violin.png');
    expect(command.getDescription()).toContain('image');
    command.undo();
    expect(track.getImageName()).toBeUndefined();
    command.execute();
    expect(track.getImageName()).toBe('violin.png');
    const reset = new UpdateTrackCommand(1, { imageName: null });
    reset.execute();
    expect(track.getImageName()).toBeUndefined();
    reset.undo();
    expect(track.getImageName()).toBe('violin.png');
  });

  it('restores the custom image when undoing an instrument change', () => {
    const midi = new KGMidiTrack('Lead', 1);
    midi.setImageName('cello.png');
    project.setTracks([midi]);
    const unchanged = new UpdateTrackCommand(1, { instrument: midi.getInstrument() });
    unchanged.execute();
    expect(midi.getImageName()).toBe('cello.png');
    expect(unchanged.getChangedProperties().size).toBe(0);
    const change = new UpdateTrackCommand(1, { instrument: 'violin' });
    change.execute();
    expect(midi.getResolvedImageName()).toBe('violin.png');
    change.undo();
    expect(midi.getInstrument()).toBe('acoustic_grand_piano');
    expect(midi.getImageName()).toBe('cello.png');
    change.execute();
    expect(midi.getResolvedImageName()).toBe('violin.png');
    change.undo();
    expect(midi.getImageName()).toBe('cello.png');
  });

});
