import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PianoRollContent from './PianoRollContent';
import { createMockMidiNote, createMockMidiRegion } from '../../test/utils/mock-data';
import type { KeySignature } from '../../core/KGProject';
import { parseSheetQuantization } from './sheetNotation';
import { velocityToColor } from '../../util/velocityColor';

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
const pianoGridSpy = vi.fn();
vi.mock('./PianoGrid', () => ({
  default: (props: { children?: React.ReactNode; mode?: string }) => {
    pianoGridSpy(props);
    return <div data-testid="piano-grid">{props.children}</div>;
  },
}));
vi.mock('./PianoNote', () => ({ default: () => <div data-testid="piano-note" /> }));
vi.mock('./PianoRollAutomationLane', () => ({ default: () => <div data-testid="automation-lane" /> }));
const sheetMusicViewSpy = vi.fn();

vi.mock('./SheetMusicView', () => ({
  default: (props: unknown) => {
    sheetMusicViewSpy(props);
    return <div data-testid="sheet-music-view" />;
  },
}));

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
    chordGuide: 'N' as const,
    bpm: 120,
  };

  beforeEach(() => {
    sheetMusicViewSpy.mockClear();
    pianoGridSpy.mockClear();
  });

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

  it('suppresses the automation lane in waveform mode and forwards the explicit mode', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="audio-waveform"
        automationEnabled={true}
        automationType="cc-7"
      />
    );

    expect(screen.getByTestId('piano-roll-content-single')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-lane')).not.toBeInTheDocument();
    expect(pianoGridSpy).toHaveBeenCalledWith(expect.objectContaining({ mode: 'audio-waveform' }));
  });

  it('shows an overlay message when one is supplied by the parent panel', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="spectrogram"
        overlayMessage="Detecting chords…"
        overlayProgressPercent={42}
      />
    );

    expect(screen.getByText('Detecting chords…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
  });

  it('renders sheet mode without piano keys or automation lane', () => {
    render(
      <PianoRollContent
        {...baseProps}
        mode="midi-edit"
        automationEnabled={true}
        automationType="cc-7"
        sheetMusicViewEnabled={true}
        sheetMusicTrackScopeEnabled={true}
        sheetQuantization={parseSheetQuantization('16,48')}
      />
    );

    expect(screen.getByTestId('sheet-music-view')).toBeInTheDocument();
    expect(screen.queryByTestId('piano-keys')).not.toBeInTheDocument();
    expect(screen.queryByTestId('automation-lane')).not.toBeInTheDocument();
    expect(sheetMusicViewSpy).toHaveBeenCalledWith(expect.objectContaining({
      sheetMusicTrackScopeEnabled: true,
      maxBars: 8,
    }));
  });

  it('renders MIDI reference notes as read-only absolute-timeline outlines', () => {
    const activeRegion = createMockMidiRegion({
      notes: [createMockMidiNote({ id: 'main-note', startBeat: 0, endBeat: 1 })],
    });
    const referenceMidiRegion = createMockMidiRegion({
      id: 'reference-region',
      startFromBeat: 8,
      notes: [createMockMidiNote({ id: 'reference-note', startBeat: 1, endBeat: 3, pitch: 60 })],
    });

    const { container } = render(
      <PianoRollContent
        {...baseProps}
        activeRegion={activeRegion}
        referenceMidiRegion={referenceMidiRegion}
        mode="midi-reference"
      />
    );

    expect(screen.getAllByTestId('piano-note')).toHaveLength(1);
    const referenceNote = container.querySelector('[data-reference-note-id="reference-note"]');
    expect(referenceNote).toHaveClass('piano-grid-midi-reference-note');
    expect(referenceNote).toHaveAttribute('data-reference-region-id', 'reference-region');
    expect(referenceNote).toHaveStyle({ left: '360px', top: '940px', width: '80px', height: '20px' });
    expect(referenceNote).toHaveStyle({ borderColor: velocityToColor(80) });
    expect((referenceNote as HTMLElement).onclick).toBeNull();
  });
});
