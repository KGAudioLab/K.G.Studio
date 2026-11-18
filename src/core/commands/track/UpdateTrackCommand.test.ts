import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import { KGTrack } from '../../track/KGTrack';
import { DEFAULT_AI_STRINGS_REGION_COLOR, DEFAULT_MIDI_REGION_COLOR } from '../../../constants/regionColorPalette';
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
    getSelectedItems: vi.fn((): KGMidiNote[] => []),
    removeSelectedItems: vi.fn(),
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

  it.each([undefined, '#8C2B7A'])('swaps default region colors and supports undo with track color %s', trackColor => {
    const midi = new KGMidiTrack('Violin', 1, 'violin');
    midi.setColor(trackColor);
    const inherited = new KGMidiRegion('inherited', '1', 0, 'Inherited');
    const green = new KGMidiRegion('green', '1', 0, 'Green');
    const custom = new KGMidiRegion('custom', '1', 0, 'Custom');
    const originalColors = [undefined, DEFAULT_MIDI_REGION_COLOR.toLowerCase(), '#3D77C9'];
    green.setColor(originalColors[1]);
    custom.setColor(originalColors[2]);
    midi.setRegions([inherited, green, custom]);
    project.setTracks([midi]);

    const colors = () => midi.getRegions().map(region => region.getColor());
    const toAi = new UpdateTrackCommand(1, { instrument: 'ai_violin' });
    const aiColors = [trackColor ? undefined : DEFAULT_AI_STRINGS_REGION_COLOR, DEFAULT_AI_STRINGS_REGION_COLOR, '#3D77C9'];
    toAi.execute();
    expect(colors()).toEqual(aiColors);
    toAi.undo();
    expect(colors()).toEqual(originalColors);
    toAi.execute();
    expect(colors()).toEqual(aiColors);

    const toRegular = new UpdateTrackCommand(1, { instrument: 'violin' });
    const regularColors = [trackColor ? undefined : DEFAULT_MIDI_REGION_COLOR, DEFAULT_MIDI_REGION_COLOR, '#3D77C9'];
    toRegular.execute();
    expect(colors()).toEqual(regularColors);
    toRegular.undo();
    expect(colors()).toEqual(aiColors);
    toRegular.execute();
    expect(colors()).toEqual(regularColors);
  });

  it('interprets AI keyswitches across regions and restores the original notes on undo', () => {
    const midi = new KGMidiTrack('Cello', 1, 'cello');
    const first = new KGMidiRegion('first', '1', 0, 'First', 960, 960);
    const later = new KGMidiRegion('later', '1', 0, 'Later', 1920, 960);
    const sustain = new KGMidiNote('sustain', 0, 120, 48);
    const spiccatoSwitch = new KGMidiNote('switch-spiccato', 120, 180, 25);
    const spiccato = new KGMidiNote('spiccato', 0, 120, 49);
    const pizzicato = new KGMidiNote('pizzicato', 120, 240, 50, 96, 3);
    const pizzicatoSwitch = new KGMidiNote('switch-pizzicato', 120, 180, 26);
    const reset = new KGMidiNote('reset', 240, 360, 51);
    const resetSwitch = new KGMidiNote('switch-sustain', 240, 300, 27);
    const firstNotes = [sustain, spiccatoSwitch];
    const laterNotes = [spiccato, pizzicato, pizzicatoSwitch, reset, resetSwitch];
    first.setNotes(firstNotes);
    later.setNotes(laterNotes);
    midi.setRegions([later, first]);
    project.setTracks([midi]);
    spiccatoSwitch.select();
    spiccato.select();
    mockCore.getSelectedItems.mockReturnValueOnce([spiccatoSwitch, spiccato]);

    const command = new UpdateTrackCommand(1, { instrument: 'ai_cello' });
    command.execute();

    expect(midi.getInstrument()).toBe('ai_cello');
    expect(first.getNotes()).toEqual([sustain]);
    expect(later.getNotes()).toEqual([spiccato, pizzicato, reset]);
    expect(later.getNotes().map(note => note.getArticulation())).toEqual([1, 2, 0]);
    expect(mockCore.removeSelectedItems).toHaveBeenCalledExactlyOnceWith([spiccatoSwitch]);
    expect(spiccatoSwitch.isSelected()).toBe(false);
    expect(spiccato.isSelected()).toBe(true);

    command.undo();
    expect(midi.getInstrument()).toBe('cello');
    expect(first.getNotes()).toEqual(firstNotes);
    expect(later.getNotes()).toEqual(laterNotes);
    expect(later.getNotes().map(note => note.getArticulation())).toEqual([0, 3, 0, 0, 0]);

    command.execute();
    expect(later.getNotes()).toEqual([spiccato, pizzicato, reset]);
    expect(later.getNotes().map(note => note.getArticulation())).toEqual([1, 2, 0]);
  });

  it('preserves low notes and explicit articulations when switching between AI instruments', () => {
    const midi = new KGMidiTrack('Strings', 1, 'ai_cello');
    const region = new KGMidiRegion('part', '1', 0, 'Part', 0, 960);
    const notes = [new KGMidiNote('low-note', 0, 120, 37, 96, 2), new KGMidiNote('high-note', 120, 240, 60)];
    region.setNotes(notes);
    midi.addRegion(region);
    project.setTracks([midi]);

    new UpdateTrackCommand(1, { instrument: 'ai_violin' }).execute();

    expect(midi.getInstrument()).toBe('ai_violin');
    expect(region.getNotes()).toEqual(notes);
    expect(region.getNotes().map(note => note.getArticulation())).toEqual([2, 0]);
  });

});
