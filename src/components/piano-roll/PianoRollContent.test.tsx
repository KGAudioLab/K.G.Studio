import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PianoRollContent from './PianoRollContent';
import { createMockMidiRegion } from '../../test/utils/mock-data';
import type { KeySignature } from '../../core/KGProject';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector: (state: { isRecording: boolean; recordingNotes: [] }) => unknown) => (
    selector({ isRecording: false, recordingNotes: [] })
  ),
}));

vi.mock('../../hooks/useNoteOperations', () => ({
  useNoteOperations: () => ({
    resizingNoteId: null,
    draggingNoteId: null,
    tempNoteStyles: {},
    noteUpdateCounter: 0,
    setNoteUpdateCounter: vi.fn(),
    handleGridDoubleClick: vi.fn(),
    handleGridClick: vi.fn(),
    handleNoteResizeStart: vi.fn(),
    handleNoteResize: vi.fn(),
    handleNoteResizeEnd: vi.fn(),
    handleNoteDragStart: vi.fn(),
    handleNoteDrag: vi.fn(),
    handleNoteDragEnd: vi.fn(),
    deleteSelectedNotes: vi.fn(),
  }),
}));

vi.mock('../../hooks/useNoteSelection', () => ({
  useNoteSelection: () => ({
    selectedNoteIds: new Set<string>(),
    isBoxSelectingRef: { current: false },
    selectionBoxRef: { current: { startX: 0, startY: 0, endX: 0, endY: 0 } },
    selectionBoxRender: 0,
    handleNoteClick: vi.fn(),
    handleBackgroundClick: vi.fn(),
    handleBackgroundMouseDown: vi.fn(),
    cleanupSelectionListeners: vi.fn(),
  }),
}));

vi.mock('./PianoGridHeader', () => ({ default: () => <div data-testid="piano-grid-header" /> }));
vi.mock('./PianoKeys', () => ({ default: () => <div data-testid="piano-keys" /> }));
vi.mock('./PianoGrid', () => ({ default: ({ children }: { children?: React.ReactNode }) => <div data-testid="piano-grid">{children}</div> }));
vi.mock('./PianoNote', () => ({ default: () => <div data-testid="piano-note" /> }));
vi.mock('./PianoRollAutomationLane', () => ({ default: () => <div data-testid="automation-lane" /> }));

describe('PianoRollContent', () => {
  const baseProps = {
    contentRef: { current: null },
    noteScrollRef: { current: null },
    pianoGridRef: { current: null },
    maxBars: 8,
    timeSignature: { numerator: 4, denominator: 4 },
    activeRegion: createMockMidiRegion(),
    updateTrack: vi.fn(),
    tracks: [],
    selectedMode: 'ionian',
    keySignature: 'C major' as KeySignature,
    chordGuide: 'N',
    bpm: 120,
  };

  it('keeps the single-pane layout when automation is disabled', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="midi-edit"
        automationEnabled={false}
        automationType="pitch-bend"
      />
    );

    expect(screen.getByTestId('piano-roll-content-single')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-lane')).not.toBeInTheDocument();
  });

  it('renders the split layout and automation lane in midi mode', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="midi-edit"
        automationEnabled={true}
        automationType="cc-7"
      />
    );

    expect(screen.getByTestId('piano-roll-content-split')).toBeInTheDocument();
    expect(screen.getByTestId('automation-lane')).toBeInTheDocument();
  });

  it('suppresses the automation lane in spectrogram mode', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="spectrogram"
        automationEnabled={true}
        automationType="cc-7"
      />
    );

    expect(screen.getByTestId('piano-roll-content-single')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-lane')).not.toBeInTheDocument();
  });
});
