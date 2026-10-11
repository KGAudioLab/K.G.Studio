import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import type { KGTrack } from '../../track/KGTrack';
import { quarterNotesToTicks, ticksPerBar } from '../../timing';
import { PasteRegionsCommand } from './PasteRegionsCommand';

let tracks: KGTrack[] = [];
let maxBars = 8;
let timeSignature = { numerator: 4, denominator: 4 };

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => ({
        getTracks: () => tracks,
        getMaxBars: () => maxBars,
        setMaxBars: (value: number) => { maxBars = value; },
        getTimeSignature: () => timeSignature,
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
    timeSignature = { numerator: 4, denominator: 4 };
  });

  it('pastes regions from one source track onto the selected track', () => {
    const sourceTrack = new KGMidiTrack('Source', 1, 'acoustic_grand_piano');
    const selectedTrack = new KGMidiTrack('Selected', 2, 'acoustic_grand_piano');
    sourceTrack.setTrackIndex(0);
    selectedTrack.setTrackIndex(1);
    tracks = [sourceTrack, selectedTrack];

    const regions = [
      new KGMidiRegion('a', '1', 0, 'A', quarterNotesToTicks(2), quarterNotesToTicks(4)),
      new KGMidiRegion('b', '1', 0, 'B', quarterNotesToTicks(5), quarterNotesToTicks(2)),
    ];
    const command = PasteRegionsCommand.fromRegions('2', quarterNotesToTicks(10), regions);

    command.execute();

    expect(sourceTrack.getRegions()).toHaveLength(0);
    expect(selectedTrack.getRegions().map(region => region.getStartTick())).toEqual([10, 13].map(quarterNotesToTicks));
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

    const midiRegion = new KGMidiRegion('midi', '1', 0, 'Melody', quarterNotesToTicks(2), quarterNotesToTicks(4));
    midiRegion.setColor('#123456');
    midiRegion.addNote(new KGMidiNote('note', quarterNotesToTicks(0.5), quarterNotesToTicks(1.5), 64, 99));
    const audioRegion = new KGAudioRegion(
      'audio',
      '2',
      1,
      'Vocal',
      quarterNotesToTicks(6),
      quarterNotesToTicks(8),
      'audio-file-id',
      'vocal.wav',
      12.5,
      1.25,
      5.25,
    );
    audioRegion.setColor('#654321');
    const command = PasteRegionsCommand.fromRegions('3', quarterNotesToTicks(10), [midiRegion, audioRegion]);

    command.execute();

    const pastedMidi = midiTrack.getRegions()[0];
    const pastedAudio = audioTrack.getRegions()[0];
    expect(pastedMidi.getStartTick()).toBe(quarterNotesToTicks(10));
    expect(pastedAudio.getStartTick()).toBe(quarterNotesToTicks(14));
    expect(selectedTrack.getRegions()).toHaveLength(0);
    expect(pastedMidi).toBeInstanceOf(KGMidiRegion);
    expect((pastedMidi as KGMidiRegion).getNotes()).toHaveLength(1);
    expect((pastedMidi as KGMidiRegion).getNotes()[0].getPitch()).toBe(64);
    expect(pastedMidi.getColor()).toBe('#123456');
    expect(pastedAudio).toBeInstanceOf(KGAudioRegion);
    expect((pastedAudio as KGAudioRegion).getAudioFileId()).toBe('audio-file-id');
    expect((pastedAudio as KGAudioRegion).getClipStartOffsetSeconds()).toBe(1.25);
    expect((pastedAudio as KGAudioRegion).getClipEndOffsetSeconds()).toBe(5.25);
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

  it.each([
    [8, 4, 4],
    [32, 4, 4],
    [8, 3, 4],
    [8, 6, 8],
  ])('keeps a %i-bar project unchanged when copying four bars in %i/%i', (initialBars, numerator, denominator) => {
    maxBars = initialBars;
    timeSignature = { numerator, denominator };
    const barTicks = ticksPerBar(timeSignature);
    const track = new KGMidiTrack('Melody', 1, 'acoustic_grand_piano');
    const source = new KGMidiRegion('source', '1', 0, 'Melody', 0, 4 * barTicks);
    source.addNote(new KGMidiNote('note', 0, barTicks, 60, 100));
    track.setRegions([source]);
    tracks = [track];
    const command = PasteRegionsCommand.fromRegions('1', 4 * barTicks, [source]);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      command.execute();
      expect(maxBars).toBe(initialBars);
      const copy = track.getRegions()[1] as KGMidiRegion;
      expect(copy.getStartTick()).toBe(4 * barTicks);
      expect(copy.getLengthTicks()).toBe(4 * barTicks);
      expect(copy.getNotes()[0]).not.toBe(source.getNotes()[0]);
      expect(copy.getNotes()[0].getEndTick()).toBe(barTicks);
      command.undo();
      expect(maxBars).toBe(initialBars);
      expect(track.getRegions()).toEqual([source]);
    }
  });

  it.each([
    [4, 4, 4, 4, 8],
    [3, 4, 4, 4, 8],
    [6, 8, 4, 4, 8],
    [4, 4, 4.25, 4, 9],
  ])('expands and restores a timeline in %i/%i for a fractional or whole-bar end', (numerator, denominator, pasteBar, lengthBars, expectedBars) => {
    maxBars = 4;
    timeSignature = { numerator, denominator };
    const barTicks = ticksPerBar(timeSignature);
    const track = new KGMidiTrack('Melody', 1, 'acoustic_grand_piano');
    const source = new KGMidiRegion('source', '1', 0, 'Melody', 0, lengthBars * barTicks);
    track.setRegions([source]);
    tracks = [track];
    const command = PasteRegionsCommand.fromRegions('1', pasteBar * barTicks, [source]);

    command.execute();
    expect(maxBars).toBe(expectedBars);
    command.undo();
    expect(maxBars).toBe(4);
    command.execute();
    expect(maxBars).toBe(expectedBars);
  });

  it('aborts atomically when an original track is missing', () => {
    const availableTrack = new KGMidiTrack('Available', 1, 'acoustic_grand_piano');
    availableTrack.setTrackIndex(0);
    tracks = [availableTrack];
    const regions = [
      new KGMidiRegion('available', '1', 0, 'Available region', quarterNotesToTicks(0), quarterNotesToTicks(4)),
      new KGMidiRegion('missing', '2', 1, 'Missing region', quarterNotesToTicks(4), quarterNotesToTicks(4)),
    ];
    const command = PasteRegionsCommand.fromRegions(null, quarterNotesToTicks(12), regions);

    expect(() => command.execute()).toThrow('Some of the original tracks are no longer available');
    expect(availableTrack.getRegions()).toHaveLength(0);
    expect(command.getCreatedRegions()).toHaveLength(0);
  });
});
