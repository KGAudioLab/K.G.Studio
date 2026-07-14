import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import type { KGTrack } from '../../track/KGTrack';
import { PasteRegionsCommand } from './PasteRegionsCommand';

let tracks: KGTrack[] = [];
let maxBars = 8;

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => ({
        getTracks: () => tracks,
        getMaxBars: () => maxBars,
        setMaxBars: (value: number) => { maxBars = value; },
        getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
      }),
    }),
  },
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeRegionId: null,
      showPianoRoll: false,
      setShowPianoRoll: vi.fn(),
      setActiveRegionId: vi.fn(),
    }),
  },
}));

describe('PasteRegionsCommand', () => {
  beforeEach(() => {
    tracks = [];
    maxBars = 8;
  });

  it('pastes regions from one source track onto the selected track', () => {
    const sourceTrack = new KGMidiTrack('Source', 1, 'acoustic_grand_piano');
    const selectedTrack = new KGMidiTrack('Selected', 2, 'acoustic_grand_piano');
    sourceTrack.setTrackIndex(0);
    selectedTrack.setTrackIndex(1);
    tracks = [sourceTrack, selectedTrack];

    const regions = [
      new KGMidiRegion('a', '1', 0, 'A', 2, 4),
      new KGMidiRegion('b', '1', 0, 'B', 5, 2),
    ];
    const command = PasteRegionsCommand.fromRegions('2', 10, regions);

    command.execute();

    expect(sourceTrack.getRegions()).toHaveLength(0);
    expect(selectedTrack.getRegions().map(region => region.getStartFromBeat())).toEqual([10, 13]);
    expect(selectedTrack.getRegions().every(region => region.getTrackId() === '2')).toBe(true);
    expect(maxBars).toBe(8);
  });

  it('pastes multi-track MIDI and audio regions onto their original tracks and supports undo and redo', () => {
    maxBars = 4;
    const midiTrack = new KGMidiTrack('MIDI', 1, 'acoustic_grand_piano');
    const audioTrack = new KGAudioTrack('Audio', 2);
    const selectedTrack = new KGMidiTrack('Ignored selection', 3, 'acoustic_grand_piano');
    midiTrack.setTrackIndex(0);
    audioTrack.setTrackIndex(1);
    selectedTrack.setTrackIndex(2);
    tracks = [midiTrack, audioTrack, selectedTrack];

    const midiRegion = new KGMidiRegion('midi', '1', 0, 'Melody', 2, 4);
    midiRegion.setColor('#123456');
    midiRegion.addNote(new KGMidiNote('note', 0.5, 1.5, 64, 99));
    const audioRegion = new KGAudioRegion(
      'audio',
      '2',
      1,
      'Vocal',
      6,
      8,
      'audio-file-id',
      'vocal.wav',
      12.5,
      1.25,
    );
    audioRegion.setColor('#654321');
    const command = PasteRegionsCommand.fromRegions('3', 10, [midiRegion, audioRegion]);

    command.execute();

    const pastedMidi = midiTrack.getRegions()[0];
    const pastedAudio = audioTrack.getRegions()[0];
    expect(pastedMidi.getStartFromBeat()).toBe(10);
    expect(pastedAudio.getStartFromBeat()).toBe(14);
    expect(selectedTrack.getRegions()).toHaveLength(0);
    expect(pastedMidi).toBeInstanceOf(KGMidiRegion);
    expect((pastedMidi as KGMidiRegion).getNotes()).toHaveLength(1);
    expect((pastedMidi as KGMidiRegion).getNotes()[0].getPitch()).toBe(64);
    expect(pastedMidi.getColor()).toBe('#123456');
    expect(pastedAudio).toBeInstanceOf(KGAudioRegion);
    expect((pastedAudio as KGAudioRegion).getAudioFileId()).toBe('audio-file-id');
    expect((pastedAudio as KGAudioRegion).getClipStartOffsetSeconds()).toBe(1.25);
    expect(pastedAudio.getColor()).toBe('#654321');
    expect(command.getTargetTracks()).toEqual([midiTrack, audioTrack]);
    expect(maxBars).toBe(6);

    command.undo();
    expect(midiTrack.getRegions()).toHaveLength(0);
    expect(audioTrack.getRegions()).toHaveLength(0);
    expect(maxBars).toBe(4);

    command.execute();
    expect(midiTrack.getRegions()).toHaveLength(1);
    expect(audioTrack.getRegions()).toHaveLength(1);
    expect(maxBars).toBe(6);
  });

  it('aborts atomically when an original track is missing', () => {
    const availableTrack = new KGMidiTrack('Available', 1, 'acoustic_grand_piano');
    availableTrack.setTrackIndex(0);
    tracks = [availableTrack];
    const regions = [
      new KGMidiRegion('available', '1', 0, 'Available region', 0, 4),
      new KGMidiRegion('missing', '2', 1, 'Missing region', 4, 4),
    ];
    const command = PasteRegionsCommand.fromRegions(null, 12, regions);

    expect(() => command.execute()).toThrow('Some of the original tracks are no longer available');
    expect(availableTrack.getRegions()).toHaveLength(0);
    expect(command.getCreatedRegions()).toHaveLength(0);
  });
});
