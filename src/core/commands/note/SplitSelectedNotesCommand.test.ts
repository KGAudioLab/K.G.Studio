import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Selectable } from '../../../components/interfaces';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { SplitSelectedNotesCommand } from './SplitSelectedNotesCommand';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../../test/utils/mock-data';

vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn(),
  }
}));

interface MockCore {
  getCurrentProject: ReturnType<typeof vi.fn>;
  getSelectedItems: ReturnType<typeof vi.fn>;
  clearSelectedItems: ReturnType<typeof vi.fn>;
  addSelectedItems: ReturnType<typeof vi.fn>;
}

describe('SplitSelectedNotesCommand', () => {
  let mockCore: MockCore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCore = {
      getCurrentProject: vi.fn(),
      getSelectedItems: vi.fn(),
      clearSelectedItems: vi.fn(),
      addSelectedItems: vi.fn(),
    };

    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore);
  });

  it('splits one selected note into two halves and selects both results', () => {
    const splitNote = createMockMidiNote({ id: 'note-a', startBeat: 1, endBeat: 5, pitch: 64, velocity: 90 });
    splitNote.select();
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      notes: [splitNote],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    mockCore.getSelectedItems.mockReturnValue([splitNote]);

    const command = new SplitSelectedNotesCommand(region.getId(), [splitNote.getId()], 3);

    command.execute();

    const notes = region.getNotes();
    expect(notes).toHaveLength(2);
    expect(notes.map(note => [note.getStartBeat(), note.getEndBeat(), note.getPitch(), note.getVelocity()])).toEqual([
      [1, 3, 64, 90],
      [3, 5, 64, 90],
    ]);
    expect(notes.every(note => note.isSelected())).toBe(true);
    expect(command.getSplitCount()).toBe(1);
    expect(mockCore.clearSelectedItems).toHaveBeenCalledTimes(1);
    expect(mockCore.addSelectedItems).toHaveBeenCalledTimes(1);
    expect((mockCore.addSelectedItems.mock.calls[0][0] as Selectable[])).toHaveLength(2);
  });

  it('splits multiple selected notes in one undoable operation and leaves uncrossed selected notes unchanged', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 4, pitch: 60, velocity: 70 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 62, velocity: 75 });
    const noteC = createMockMidiNote({ id: 'note-c', startBeat: 2, endBeat: 5, pitch: 65, velocity: 80 });
    [noteA, noteB, noteC].forEach(note => note.select());
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      notes: [noteA, noteB, noteC],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    mockCore.getSelectedItems.mockReturnValue([noteA, noteB, noteC]);

    const command = new SplitSelectedNotesCommand(region.getId(), [noteA.getId(), noteB.getId(), noteC.getId()], 3);

    command.execute();

    const notes = region.getNotes();
    expect(notes).toHaveLength(5);
    expect(notes.map(note => [note.getStartBeat(), note.getEndBeat(), note.getPitch()])).toEqual([
      [0, 3, 60],
      [3, 4, 60],
      [1, 2, 62],
      [2, 3, 65],
      [3, 5, 65],
    ]);
    expect(command.getSplitCount()).toBe(2);
    expect(command.getUnchangedSelectedNoteIds()).toEqual(['note-b']);

    command.undo();
    expect(region.getNotes()).toEqual([noteA, noteB, noteC]);
    expect(mockCore.clearSelectedItems).toHaveBeenCalledTimes(2);
    expect(mockCore.addSelectedItems).toHaveBeenLastCalledWith([noteA, noteB, noteC]);

    command.execute();
    expect(region.getNotes().map(note => [note.getStartBeat(), note.getEndBeat(), note.getPitch()])).toEqual([
      [0, 3, 60],
      [3, 4, 60],
      [1, 2, 62],
      [2, 3, 65],
      [3, 5, 65],
    ]);
  });

  it('throws when no selected note crosses the playhead', () => {
    const noteA = new KGMidiNote('note-a', 0, 1, 60, 100);
    const noteB = new KGMidiNote('note-b', 4, 5, 62, 100);
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      notes: [noteA, noteB],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    mockCore.getCurrentProject.mockReturnValue(createMockProject({ tracks: [track] }));
    mockCore.getSelectedItems.mockReturnValue([noteA, noteB]);

    const command = new SplitSelectedNotesCommand(region.getId(), [noteA.getId(), noteB.getId()], 3);

    expect(() => command.execute()).toThrow(
      'The playhead is not inside any selected note. Move the playhead inside a selected note before splitting.'
    );
  });
});
