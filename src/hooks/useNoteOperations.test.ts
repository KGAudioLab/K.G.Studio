import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SelectableItem = { getId: () => string };

const coreState = {
  selectedItems: [] as SelectableItem[],
  selectionChangedCallbacks: [] as Array<() => void>,
  executeCommand: vi.fn(),
};

const projectStoreState = {
  selectedNoteIds: [] as string[],
  clearAllSelections: () => {
    coreState.selectedItems = [];
    syncSelectionFromCore();
  },
  bumpAutomationRedrawVersion: vi.fn(),
  syncSelectionFromCore: () => {
    syncSelectionFromCore();
  },
};

const syncSelectionFromCore = () => {
  projectStoreState.selectedNoteIds = coreState.selectedItems.map(item => item.getId());
  coreState.selectionChangedCallbacks.forEach(callback => callback());
};

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getSelectedItems: () => coreState.selectedItems,
      addSelectedItem: (item: SelectableItem) => {
        coreState.selectedItems = coreState.selectedItems.filter(selectedItem => selectedItem.getId() !== item.getId());
        coreState.selectedItems.push(item);
        syncSelectionFromCore();
      },
      addSelectedItems: (items: SelectableItem[]) => {
        const incomingIds = new Set(items.map(item => item.getId()));
        coreState.selectedItems = coreState.selectedItems.filter(item => !incomingIds.has(item.getId()));
        coreState.selectedItems.push(...items);
        syncSelectionFromCore();
      },
      clearSelectedItems: () => {
        coreState.selectedItems = [];
        syncSelectionFromCore();
      },
      executeCommand: (...args: unknown[]) => coreState.executeCommand(...args),
      onSelectionChanged: (callback: () => void) => {
        coreState.selectionChangedCallbacks.push(callback);
      },
    }),
  },
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: Object.assign(vi.fn(), {
    getState: () => projectStoreState,
  }),
}));

import { useNoteOperations } from './useNoteOperations';
import { KGCore } from '../core/KGCore';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { MoveNotesCommand, ResizeNotesCommand } from '../core/commands';
import { useProjectStore } from '../stores/projectStore';
import { createMockMidiNote, createMockMidiRegion, createMockMidiTrack } from '../test/utils/mock-data';

describe('useNoteOperations', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    coreState.selectedItems = [];
    coreState.selectionChangedCallbacks = [];
    coreState.executeCommand = vi.fn();
    projectStoreState.selectedNoteIds = [];
    projectStoreState.bumpAutomationRedrawVersion.mockReset();

    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (property: string) => {
        if (property === '--region-grid-beat-width') {
          return '40';
        }

        if (property === '--region-piano-key-height') {
          return '20';
        }

        return '';
      },
    } as CSSStyleDeclaration);

    KGPianoRollState.instance().setActiveTool('pointer');
    KGPianoRollState.instance().setCurrentSnap('1/4');
  });

  const renderNoteOperations = (activeRegion: ReturnType<typeof createMockMidiRegion>, track = createMockMidiTrack({ id: 1, regions: [activeRegion] }), updateTrack = vi.fn()) => {
    const hook = renderHook(() => useNoteOperations({
      activeRegion,
      timeSignature: { numerator: 4, denominator: 4 },
      updateTrack,
      tracks: [track],
      pianoGridRef: { current: null },
    }));

    return { ...hook, track, updateTrack };
  };

  it('selects the grabbed note before resizing when it was not part of the current selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 62 });
    const noteC = createMockMidiNote({ id: 'note-c', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB, noteC],
    });
    const track = createMockMidiTrack({ id: 1, regions: [activeRegion] });
    const updateTrack = vi.fn();

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion, track, updateTrack);

    act(() => {
      result.current.handleNoteResizeStart(noteC.getId(), 'end', 120);
    });

    expect(KGCore.instance().getSelectedItems().map(item => item.getId())).toEqual([noteC.getId()]);
    expect(useProjectStore.getState().selectedNoteIds).toEqual([noteC.getId()]);
    expect(noteA.isSelected()).toBe(false);
    expect(noteB.isSelected()).toBe(false);
    expect(noteC.isSelected()).toBe(true);

    act(() => {
      result.current.handleNoteResizeEnd(noteC.getId(), 'end');
    });

    expect(coreState.executeCommand).toHaveBeenCalledTimes(1);
    const resizeCommand = coreState.executeCommand.mock.calls[0][0];
    expect(resizeCommand).toBeInstanceOf(ResizeNotesCommand);
    expect((resizeCommand as ResizeNotesCommand).getNoteIdsToResize()).toEqual([noteC.getId()]);
  });

  it('keeps the existing multi-selection when resizing a selected note', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 62 });
    const noteC = createMockMidiNote({ id: 'note-c', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB, noteC],
    });
    const track = createMockMidiTrack({ id: 1, regions: [activeRegion] });
    const updateTrack = vi.fn();

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion, track, updateTrack);

    act(() => {
      result.current.handleNoteResizeStart(noteA.getId(), 'end', 0);
    });

    expect(KGCore.instance().getSelectedItems().map(item => item.getId())).toEqual([noteA.getId(), noteB.getId()]);
    expect(useProjectStore.getState().selectedNoteIds).toEqual([noteA.getId(), noteB.getId()]);
    expect(noteA.isSelected()).toBe(true);
    expect(noteB.isSelected()).toBe(true);
    expect(noteC.isSelected()).toBe(false);

    act(() => {
      result.current.handleNoteResizeEnd(noteA.getId(), 'end');
    });

    expect(coreState.executeCommand).toHaveBeenCalledTimes(1);
    const resizeCommand = coreState.executeCommand.mock.calls[0][0];
    expect(resizeCommand).toBeInstanceOf(ResizeNotesCommand);
    expect((resizeCommand as ResizeNotesCommand).getNoteIdsToResize()).toEqual([noteA.getId(), noteB.getId()]);
  });

  it('previews end resize for all notes in the active multi-selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 62 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      startFromBeat: 4,
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteResizeStart(noteA.getId(), 'end', 0);
      result.current.handleNoteResize(noteA.getId(), 'end', 20);
    });

    expect(result.current.tempNoteStyles).toEqual({
      'note-a': { left: '160px', width: '80px' },
      'note-b': { left: '240px', width: '80px' },
    });
  });

  it('previews start resize for all notes in the active multi-selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 1, endBeat: 3, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 4, endBeat: 6, pitch: 62 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      startFromBeat: 2,
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteResizeStart(noteA.getId(), 'start', 0);
      result.current.handleNoteResize(noteA.getId(), 'start', 20);
    });

    expect(result.current.tempNoteStyles).toEqual({
      'note-a': { left: '120px', width: '80px' },
      'note-b': { left: '240px', width: '80px' },
    });
  });

  it('previews only the grabbed note when it was outside the current selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 62 });
    const noteC = createMockMidiNote({ id: 'note-c', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB, noteC],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteResizeStart(noteC.getId(), 'end', 0);
      result.current.handleNoteResize(noteC.getId(), 'end', 20);
    });

    expect(useProjectStore.getState().selectedNoteIds).toEqual([noteC.getId()]);
    expect(result.current.tempNoteStyles).toEqual({
      'note-c': { left: '80px', width: '80px' },
    });
  });

  it('clears resize preview styles after committing a multi-note resize', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 62 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteResizeStart(noteA.getId(), 'end', 0);
      result.current.handleNoteResize(noteA.getId(), 'end', 20);
    });

    expect(Object.keys(result.current.tempNoteStyles)).toEqual(['note-a', 'note-b']);

    act(() => {
      result.current.handleNoteResizeEnd(noteA.getId(), 'end');
    });

    expect(result.current.tempNoteStyles).toEqual({});
  });

  it('commits the same snapped resize delta that is shown in the preview', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 62 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteResizeStart(noteA.getId(), 'end', 0);
      result.current.handleNoteResize(noteA.getId(), 'end', 20);
      result.current.handleNoteResizeEnd(noteA.getId(), 'end');
    });

    expect(coreState.executeCommand).toHaveBeenCalledTimes(1);
    const resizeCommand = coreState.executeCommand.mock.calls[0][0] as ResizeNotesCommand;
    expect(resizeCommand.getNoteIdsToResize()).toEqual([noteA.getId(), noteB.getId()]);
    expect((resizeCommand as unknown as { primaryEndBeatDelta: number }).primaryEndBeatDelta).toBe(1);
  });

  it('previews drag movement for all notes in the active multi-selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      startFromBeat: 4,
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteDragStart(noteA.getId(), 0, 0);
      result.current.handleNoteDrag(noteA.getId(), 20, 15);
    });

    expect(result.current.tempNoteStyles).toEqual({
      'note-a': { left: '200px', top: '955px', width: '40px', height: '20px', zIndex: 100 },
      'note-b': { left: '280px', top: '875px', width: '40px', height: '20px', zIndex: 100 },
    });
  });

  it('previews only the grabbed note during drag when it was outside the current selection', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 1, endBeat: 2, pitch: 62 });
    const noteC = createMockMidiNote({ id: 'note-c', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB, noteC],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteDragStart(noteC.getId(), 0, 0);
      result.current.handleNoteDrag(noteC.getId(), 20, 15);
    });

    expect(result.current.tempNoteStyles).toEqual({
      'note-c': { left: '120px', top: '875px', width: '40px', height: '20px', zIndex: 100 },
    });
  });

  it('clears drag preview styles after committing a multi-note move', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteDragStart(noteA.getId(), 0, 0);
      result.current.handleNoteDrag(noteA.getId(), 20, 15);
    });

    expect(Object.keys(result.current.tempNoteStyles)).toEqual(['note-a', 'note-b']);

    act(() => {
      result.current.handleNoteDragEnd(noteA.getId());
    });

    expect(result.current.tempNoteStyles).toEqual({});
  });

  it('commits the same drag cohort and deltas that are shown in the preview', () => {
    const noteA = createMockMidiNote({ id: 'note-a', startBeat: 0, endBeat: 1, pitch: 60 });
    const noteB = createMockMidiNote({ id: 'note-b', startBeat: 2, endBeat: 3, pitch: 64 });
    const activeRegion = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      notes: [noteA, noteB],
    });

    noteA.select();
    noteB.select();
    KGCore.instance().addSelectedItems([noteA, noteB]);

    const { result } = renderNoteOperations(activeRegion);

    act(() => {
      result.current.handleNoteDragStart(noteA.getId(), 0, 0);
      result.current.handleNoteDrag(noteA.getId(), 20, 15);
      result.current.handleNoteDragEnd(noteA.getId());
    });

    expect(coreState.executeCommand).toHaveBeenCalledTimes(1);
    const moveCommand = coreState.executeCommand.mock.calls[0][0] as MoveNotesCommand;
    expect(moveCommand).toBeInstanceOf(MoveNotesCommand);
    expect(moveCommand.getNoteIdsToMove()).toEqual([noteA.getId(), noteB.getId()]);
    expect(moveCommand.getStartBeatDelta()).toBe(1);
    expect(moveCommand.getPitchDelta()).toBe(-1);
  });
});
