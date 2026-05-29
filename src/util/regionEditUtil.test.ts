import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Selectable } from '../components/interfaces';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { createMockMidiRegion, createMockMidiTrack, createMockProject } from '../test/utils/mock-data';
import { splitSelectedRegionAtPlayhead } from './regionEditUtil';

const storeState = {
  showPianoRoll: false,
  pianoRollMode: 'midi-edit' as 'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid',
  activeRegionId: null as string | null,
  selectedNoteIds: [] as string[],
  setShowPianoRoll: vi.fn(),
  setActiveRegionId: vi.fn(),
};

const mockCore = {
  getCurrentProject: vi.fn(),
  getSelectedItems: vi.fn<() => Selectable[]>(() => []),
  clearSelectedItems: vi.fn(),
  addSelectedItems: vi.fn(),
  executeCommand: vi.fn((command: { execute: () => void }) => {
    command.execute();
  }),
};

const dialogMocks = vi.hoisted(() => ({
  showAlert: vi.fn(),
  showConfirm: vi.fn(),
}));

const pianoRollStateMock = vi.hoisted(() => ({
  getSheetMusicViewEnabled: vi.fn(() => false),
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: {
    getState: vi.fn(() => storeState),
  },
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: vi.fn(() => mockCore),
  },
}));

vi.mock('../core/state/KGPianoRollState', () => ({
  KGPianoRollState: {
    instance: vi.fn(() => pianoRollStateMock),
  },
}));

vi.mock('./dialogUtil', () => ({
  showAlert: dialogMocks.showAlert,
  showConfirm: dialogMocks.showConfirm,
}));

describe('splitSelectedRegionAtPlayhead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.showPianoRoll = false;
    storeState.pianoRollMode = 'midi-edit';
    storeState.activeRegionId = null;
    storeState.selectedNoteIds = [];
    storeState.setShowPianoRoll.mockReset();
    storeState.setActiveRegionId.mockReset();
    pianoRollStateMock.getSheetMusicViewEnabled.mockReturnValue(false);
    mockCore.getSelectedItems.mockReset();
    mockCore.getSelectedItems.mockReturnValue([]);
    mockCore.clearSelectedItems.mockReset();
    mockCore.addSelectedItems.mockReset();
  });

  it('falls back to region split when the piano roll is closed', async () => {
    const region = createMockMidiRegion({ id: 'region-1', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 8 });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 4,
      refreshProjectState: vi.fn(),
    });

    expect(status).toBe('Split region at beat 4.00');
    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
    expect(dialogMocks.showAlert).not.toHaveBeenCalled();
  });

  it('falls back to region split when not in piano-roll view', async () => {
    const region = createMockMidiRegion({ id: 'region-1', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 8 });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.pianoRollMode = 'spectrogram';
    storeState.selectedNoteIds = ['note-1'];

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 4,
      refreshProjectState: vi.fn(),
    });

    expect(status).toBe('Split region at beat 4.00');
    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('falls back to region split when sheet music view is enabled', async () => {
    const region = createMockMidiRegion({ id: 'region-1', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 8 });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';
    storeState.selectedNoteIds = ['note-1'];
    pianoRollStateMock.getSheetMusicViewEnabled.mockReturnValue(true);

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 4,
      refreshProjectState: vi.fn(),
    });

    expect(status).toBe('Split region at beat 4.00');
    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('splits selected notes when the piano roll is open in midi-edit view', async () => {
    const note = new KGMidiNote('note-1', 1, 5, 60, 100);
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      notes: [note],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';
    storeState.selectedNoteIds = ['note-1'];
    const refreshProjectState = vi.fn();
    mockCore.getSelectedItems.mockReturnValue([note]);

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 3,
      refreshProjectState,
    });

    expect(status).toBe('Split 1 note at beat 3.00');
    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
    expect(region.getNotes().map(candidate => [candidate.getStartBeat(), candidate.getEndBeat()])).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });

  it('splits selected notes using playhead position relative to the region start', async () => {
    const note = new KGMidiNote('note-1', 1, 5, 60, 100);
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 8,
      length: 8,
      notes: [note],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';
    storeState.selectedNoteIds = ['note-1'];
    mockCore.getSelectedItems.mockReturnValue([note]);

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 11,
      refreshProjectState: vi.fn(),
    });

    expect(status).toBe('Split 1 note at beat 11.00');
    expect(region.getNotes().map(candidate => [candidate.getStartBeat(), candidate.getEndBeat()])).toEqual([
      [1, 3],
      [3, 5],
    ]);
  });

  it('shows an alert when no selected note crosses the playhead', async () => {
    const note = new KGMidiNote('note-1', 1, 2, 60, 100);
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      notes: [note],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    storeState.showPianoRoll = true;
    storeState.activeRegionId = 'region-1';
    storeState.selectedNoteIds = ['note-1'];

    const status = await splitSelectedRegionAtPlayhead({
      selectedRegionIds: ['region-1'],
      playheadPosition: 3,
      refreshProjectState: vi.fn(),
    });

    expect(status).toBeNull();
    expect(dialogMocks.showAlert).toHaveBeenCalledWith(
      'The playhead is not inside any selected note. Move the playhead inside a selected note before splitting.'
    );
    expect(mockCore.executeCommand).not.toHaveBeenCalled();
  });
});
