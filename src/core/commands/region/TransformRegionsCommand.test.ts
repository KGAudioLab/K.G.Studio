import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { MoveMultipleRegionsCommand, ResizeMultipleRegionsCommand } from './TransformRegionsCommand';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../../test/utils/mock-data';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGAudioRegion } from '../../region/KGAudioRegion';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn()
  }
}));

interface MockCore {
  getCurrentProject: ReturnType<typeof vi.fn>
}

describe('TransformRegionsCommand', () => {
  let mockCore: MockCore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = {
      getCurrentProject: vi.fn()
    };
    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('moves multiple regions across tracks by the same horizontal delta', () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '2', trackIndex: 1, startFromBeat: 8, length: 4 });
    const trackA = createMockMidiTrack({ id: 1, regions: [regionA] });
    const trackB = createMockMidiTrack({ id: 2, regions: [regionB] });
    trackA.setTrackIndex(0);
    trackB.setTrackIndex(1);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [trackA, trackB] }));

    const command = new MoveMultipleRegionsCommand('region-a', 4, ['region-a', 'region-b']);

    command.execute();

    expect(regionA.getStartFromBeat()).toBe(4);
    expect(regionB.getStartFromBeat()).toBe(12);

    command.undo();

    expect(regionA.getStartFromBeat()).toBe(0);
    expect(regionB.getStartFromBeat()).toBe(8);
  });

  it('aborts bulk move when any projected region would overlap', () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, name: 'Region A', startFromBeat: 0, length: 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '1', trackIndex: 0, name: 'Region B', startFromBeat: 8, length: 4 });
    const blocker = createMockMidiRegion({ id: 'blocker', trackId: '1', trackIndex: 0, name: 'Blocker', startFromBeat: 14, length: 4 });
    const track = createMockMidiTrack({ id: 1, regions: [regionA, regionB, blocker] });
    track.setTrackIndex(0);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));

    const command = new MoveMultipleRegionsCommand('region-a', 6, ['region-a', 'region-b']);

    expect(() => command.execute()).toThrow('would overlap another region');
    expect(regionA.getStartFromBeat()).toBe(0);
    expect(regionB.getStartFromBeat()).toBe(8);
  });

  it('resizes multiple MIDI regions from the start and preserves absolute note timing', () => {
    const midiNoteA = createMockMidiNote({ id: 'note-a', startBeat: 1, endBeat: 2 });
    const midiNoteB = createMockMidiNote({ id: 'note-b', startBeat: 0.5, endBeat: 1.5 });
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 4, length: 4, notes: [midiNoteA] });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '1', trackIndex: 0, startFromBeat: 12, length: 4, notes: [midiNoteB] });
    const track = createMockMidiTrack({ id: 1, regions: [regionA, regionB] });
    track.setTrackIndex(0);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track], bpm: 120 }));

    const command = new ResizeMultipleRegionsCommand('region-a', 'start', 1, 0, ['region-a', 'region-b']);

    command.execute();

    expect(regionA.getStartFromBeat()).toBe(5);
    expect(regionA.getLength()).toBe(3);
    expect(midiNoteA.getStartBeat()).toBe(0);
    expect(midiNoteA.getEndBeat()).toBe(1);

    expect(regionB.getStartFromBeat()).toBe(13);
    expect(regionB.getLength()).toBe(3);
    expect(midiNoteB.getStartBeat()).toBe(-0.5);
    expect(midiNoteB.getEndBeat()).toBe(0.5);

    command.undo();

    expect(regionA.getStartFromBeat()).toBe(4);
    expect(regionA.getLength()).toBe(4);
    expect(midiNoteA.getStartBeat()).toBe(1);
    expect(midiNoteA.getEndBeat()).toBe(2);
    expect(regionB.getStartFromBeat()).toBe(12);
    expect(regionB.getLength()).toBe(4);
  });

  it('aborts bulk resize when any audio region would exceed its source audio bounds', () => {
    const audioTrack = new KGAudioTrack('Audio', 2);
    audioTrack.setTrackIndex(0);
    const audioA = new KGAudioRegion('audio-a', '2', 0, 'Audio A', 0, 4, 'file-a', 'a.wav', 2, 0);
    const audioB = new KGAudioRegion('audio-b', '2', 0, 'Audio B', 8, 4, 'file-b', 'b.wav', 2, 0);
    audioTrack.setRegions([audioA, audioB]);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [audioTrack as never], bpm: 120 }));

    const command = new ResizeMultipleRegionsCommand('audio-a', 'end', 0, 1, ['audio-a', 'audio-b']);

    expect(() => command.execute()).toThrow('would extend past the end of its audio file');
    expect(audioA.getLength()).toBe(4);
    expect(audioB.getLength()).toBe(4);
  });
});
