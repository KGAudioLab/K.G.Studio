import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../KGCore';
import { MergeMidiRegionsCommand } from './MergeMidiRegionsCommand';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../../test/utils/mock-data';

const storeState = {
  showPianoRoll: false,
  activeRegionId: null as string | null,
  setShowPianoRoll: vi.fn(),
  setActiveRegionId: vi.fn(),
};

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn(),
  }
}));

vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => storeState),
  }
}));

interface MockCore {
  getCurrentProject: ReturnType<typeof vi.fn>;
  getSelectedItems: ReturnType<typeof vi.fn>;
  clearSelectedItems: ReturnType<typeof vi.fn>;
  addSelectedItem: ReturnType<typeof vi.fn>;
  addSelectedItems: ReturnType<typeof vi.fn>;
}

describe('MergeMidiRegionsCommand', () => {
  let mockCore: MockCore;

  beforeEach(() => {
    vi.clearAllMocks();
    storeState.showPianoRoll = false;
    storeState.activeRegionId = null;

    mockCore = {
      getCurrentProject: vi.fn(),
      getSelectedItems: vi.fn().mockReturnValue([]),
      clearSelectedItems: vi.fn(),
      addSelectedItem: vi.fn(),
      addSelectedItems: vi.fn(),
    };

    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('merges multiple MIDI regions and preserves absolute note timing', () => {
    const regionA = createMockMidiRegion({
      id: 'region-a',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 4,
      length: 2,
      notes: [createMockMidiNote({ id: 'note-a', startBeat: 0.5, endBeat: 1.5, pitch: 60 })],
    });
    const regionB = createMockMidiRegion({
      id: 'region-b',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 8,
      length: 4,
      notes: [createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 67 })],
    });
    const regionC = createMockMidiRegion({
      id: 'region-c',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 14,
      length: 2,
      notes: [createMockMidiNote({ id: 'note-c', startBeat: 0, endBeat: 1, pitch: 72 })],
    });
    const track = createMockMidiTrack({ id: 1, regions: [regionA, regionB, regionC] });
    track.setTrackIndex(0);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));

    const command = new MergeMidiRegionsCommand(['region-b', 'region-a', 'region-c']);

    command.execute();

    expect(track.getRegions()).toEqual([regionA]);
    expect(regionA.getStartFromBeat()).toBe(4);
    expect(regionA.getLength()).toBe(12);

    const mergedNotes = regionA.getNotes();
    expect(mergedNotes).toHaveLength(3);
    expect(mergedNotes.map(note => [note.getId(), note.getStartBeat(), note.getEndBeat()])).toEqual([
      ['note-a', 0.5, 1.5],
      ['note-b', 5, 6],
      ['note-c', 10, 11],
    ]);
    expect(mockCore.clearSelectedItems).toHaveBeenCalledTimes(1);
    expect(mockCore.addSelectedItem).toHaveBeenCalledWith(regionA);
  });

  it('retargets the piano roll to the surviving region when the active region is removed', () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '1', trackIndex: 0, startFromBeat: 6, length: 4 });
    const track = createMockMidiTrack({ id: 1, regions: [regionA, regionB] });
    track.setTrackIndex(0);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-b';

    const command = new MergeMidiRegionsCommand(['region-a', 'region-b']);

    command.execute();

    expect(storeState.setActiveRegionId).toHaveBeenCalledWith('region-a');
    expect(storeState.setShowPianoRoll).toHaveBeenCalledWith(true);
  });

  it('undo restores original regions, notes, selection, and piano roll state', () => {
    const regionA = createMockMidiRegion({
      id: 'region-a',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 4,
      length: 4,
      notes: [createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1 })],
    });
    const regionB = createMockMidiRegion({
      id: 'region-b',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 10,
      length: 2,
      notes: [createMockMidiNote({ id: 'note-b', startBeat: 0.5, endBeat: 1.5 })],
    });
    const otherRegion = createMockMidiRegion({
      id: 'region-x',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 20,
      length: 2,
    });
    const track = createMockMidiTrack({ id: 1, regions: [regionA, regionB, otherRegion] });
    track.setTrackIndex(0);
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    mockCore.getSelectedItems.mockReturnValue([regionA, regionB]);
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-b';

    const command = new MergeMidiRegionsCommand(['region-a', 'region-b']);

    command.execute();
    command.undo();

    expect(track.getRegions()).toEqual([regionA, regionB, otherRegion]);
    expect(regionA.getLength()).toBe(4);
    expect(regionA.getNotes().map(note => [note.getId(), note.getStartBeat(), note.getEndBeat()])).toEqual([
      ['note-a', 0, 1],
    ]);
    expect(regionB.getLength()).toBe(2);
    expect(regionB.getNotes().map(note => [note.getId(), note.getStartBeat(), note.getEndBeat()])).toEqual([
      ['note-b', 0.5, 1.5],
    ]);
    expect(mockCore.addSelectedItems).toHaveBeenCalledWith([regionA, regionB]);
    expect(storeState.setShowPianoRoll).toHaveBeenCalledWith(true);
    expect(storeState.setActiveRegionId).toHaveBeenLastCalledWith('region-b');
  });
});
