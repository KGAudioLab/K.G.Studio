import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import { KGTrackAutomationPoint } from '../../track/KGTrackAutomationPoint';
import { DuplicateTrackCommand, generateDuplicateTrackName } from './DuplicateTrackCommand';

describe('DuplicateTrackCommand', () => {
  const setSelectedTrack = vi.fn();
  const audioInterface = {
    createTrackSynth: vi.fn(),
    createTrackAudioPlayerBus: vi.fn(),
    removeTrackSynth: vi.fn(),
    removeTrackAudioPlayerBus: vi.fn(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    setSelectedTrack.mockReset();
    Object.values(audioInterface).forEach(mock => mock.mockReset());
    vi.spyOn(KGAudioInterface, 'instance').mockReturnValue(audioInterface as unknown as KGAudioInterface);
  });

  it('finds the first exact case-sensitive name gap and treats suffixes literally', () => {
    const tracks = [
      new KGMidiTrack('Piano (1)', 1),
      new KGMidiTrack('Piano (3)', 2),
      new KGMidiTrack('piano (2)', 3),
    ];
    expect(generateDuplicateTrackName('Piano', tracks)).toBe('Piano (2)');
    expect(generateDuplicateTrackName('Piano (1)', tracks)).toBe('Piano (1) (1)');
  });

  it('deep-copies MIDI settings, automation, and regions with independent IDs', () => {
    const source = new KGMidiTrack('Lead', 4, 'trumpet', -3);
    source.setTrackIndex(0);
    source.setColor('#123456');
    source.setMuted(true);
    source.setSolo(true);
    source.setTransposeSettings({ followKeySignature: true, transpose: 5 });
    source.setNoTranspose(true);
    source.setVolumeAutomation([new KGTrackAutomationPoint('volume-source', 2, -4)]);
    source.setPanAutomation([new KGTrackAutomationPoint('pan-source', 3, 0.25)]);

    const region = new KGMidiRegion('region-source', '4', 0, 'Verse', 8, 4);
    region.setColor('#abcdef');
    region.setTransposeSettingsOverride({ followKeySignature: false, transpose: -2 });
    region.addNote(new KGMidiNote('note-source', 0, 1, 60, 90));
    region.addPitchBend(new KGMidiPitchBend('bend-source', 0.5, 9000));
    region.addControllerEvent(64, new KGMidiControllerEvent('controller-source', 1, 127));
    source.setRegions([region]);

    const tail = new KGMidiTrack('Tail', 8);
    tail.setTrackIndex(1);
    const project = new KGProject('midi-duplicate');
    project.setTracks([source, tail]);
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as unknown as KGCore);

    const command = new DuplicateTrackCommand(4, { includeAutomation: true, includeRegions: true }, setSelectedTrack);
    command.execute();

    expect(project.getTracks().map(track => track.getName())).toEqual(['Lead', 'Lead (1)', 'Tail']);
    const duplicate = command.getDuplicateTrack() as KGMidiTrack;
    expect(duplicate.getId()).toBe(9);
    expect(duplicate.getTrackIndex()).toBe(1);
    expect(duplicate.getInstrument()).toBe('trumpet');
    expect(duplicate.getVolume()).toBe(-3);
    expect(duplicate.getColor()).toBe('#123456');
    expect(duplicate.getMuted()).toBe(true);
    expect(duplicate.getSolo()).toBe(true);
    expect(duplicate.getTransposeSettings()).toEqual({ followKeySignature: true, transpose: 5 });
    expect(duplicate.getNoTranspose()).toBe(true);
    expect(duplicate.getVolumeAutomation()[0].getId()).not.toBe('volume-source');
    expect([duplicate.getVolumeAutomation()[0].getBeat(), duplicate.getVolumeAutomation()[0].getValue()]).toEqual([2, -4]);
    expect(duplicate.getVolumeAutomation()[0].isSelected()).toBe(false);

    const copiedRegion = duplicate.getRegions()[0];
    expect(copiedRegion.getName()).toBe('Verse');
    expect(copiedRegion.getId()).not.toBe(region.getId());
    expect(copiedRegion.getTrackId()).toBe('9');
    expect(copiedRegion.getTrackIndex()).toBe(1);
    expect(copiedRegion.getTransposeSettingsOverride()).toEqual({ followKeySignature: false, transpose: -2 });
    expect(copiedRegion.getNotes()[0].getId()).not.toBe('note-source');
    expect(copiedRegion.getPitchBends()[0].getId()).not.toBe('bend-source');
    expect(copiedRegion.getControllerEvents(64)[0].getId()).not.toBe('controller-source');
    expect(copiedRegion.isSelected()).toBe(false);
    expect(setSelectedTrack).toHaveBeenLastCalledWith('9');

    command.undo();
    expect(project.getTracks()).toEqual([source, tail]);
    expect(project.getTracks().map(track => track.getTrackIndex())).toEqual([0, 1]);
    expect(setSelectedTrack).toHaveBeenLastCalledWith('4');

    command.execute();
    expect(project.getTracks()[1]).toBe(duplicate);
    expect(setSelectedTrack).toHaveBeenLastCalledWith('9');
  });

  it('copies audio regions by reference and omits unchecked optional content', () => {
    const source = new KGAudioTrack('Vocal', 2, -1);
    source.setTrackIndex(0);
    source.setVolumeAutomation([new KGTrackAutomationPoint('volume-source', 1, -8)]);
    source.setRegions([
      new KGAudioRegion('audio-source', '2', 0, 'Take 1', 4, 8, 'shared-file', 'take.wav', 12, 1.5),
    ]);
    const project = new KGProject('audio-duplicate');
    project.setTracks([source]);
    vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as unknown as KGCore);

    const withoutContent = new DuplicateTrackCommand(2, { includeAutomation: false, includeRegions: false }, setSelectedTrack);
    withoutContent.execute();
    expect(withoutContent.getDuplicateTrack()?.getRegions()).toEqual([]);
    expect(withoutContent.getDuplicateTrack()?.getVolumeAutomation()).toEqual([]);
    withoutContent.undo();

    const withRegions = new DuplicateTrackCommand(2, { includeAutomation: false, includeRegions: true }, setSelectedTrack);
    withRegions.execute();
    const copiedRegion = (withRegions.getDuplicateTrack() as KGAudioTrack).getRegions()[0];
    expect(copiedRegion.getId()).not.toBe('audio-source');
    expect(copiedRegion.getName()).toBe('Take 1');
    expect(copiedRegion.getAudioFileId()).toBe('shared-file');
    expect(copiedRegion.getClipStartOffsetSeconds()).toBe(1.5);
    expect(audioInterface.createTrackAudioPlayerBus).not.toHaveBeenCalled();
  });
});
