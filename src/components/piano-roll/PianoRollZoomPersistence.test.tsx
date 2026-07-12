import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import PianoRoll from './PianoRoll';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

const pianoRollState = {
  zoom: 1,
  getCurrentSnap: vi.fn(() => 'none'),
  getActiveTool: vi.fn(() => 'pointer'),
  getAutomationViewEnabled: vi.fn(() => false),
  getCurrentAutomationType: vi.fn(() => 'pitch-bend'),
  getPianoRollZoom: vi.fn(() => pianoRollState.zoom),
  setPianoRollZoom: vi.fn((zoom: number) => {
    pianoRollState.zoom = zoom;
  }),
  getSheetMusicViewEnabled: vi.fn(() => false),
  getSheetMusicTrackScopeEnabled: vi.fn(() => false),
  getSheetQuantization: vi.fn(() => '16,48'),
  setSheetMusicViewEnabled: vi.fn(),
  setActiveTool: vi.fn(),
  setAutomationViewEnabled: vi.fn(),
  setCurrentAutomationType: vi.fn(),
  setSheetQuantization: vi.fn(),
  setSheetMusicTrackScopeEnabled: vi.fn(),
  setCurrentSnap: vi.fn(),
  setCurrentSuitableChords: vi.fn(),
  setCurrentSuitableChordsPitchClasses: vi.fn(),
  setCurrentHoveredChordGuideCandidate: vi.fn(),
};

const mockProject = {
  setPianoRollZoom: vi.fn(),
};

const region = createMockMidiRegion({ id: 'region-1', trackId: '1', trackIndex: 0 });
const track = createMockMidiTrack({ id: 1, regions: [region] });

const storeState = {
  maxBars: 8,
  tracks: [track],
  updateTrack: vi.fn(),
  timeSignature: { numerator: 4, denominator: 4 },
  pianoRollHeight: 500,
  setPianoRollHeight: vi.fn((height: number) => {
    storeState.pianoRollHeight = height;
  }),
  showChatBox: false,
  showKGOnePanel: false,
  showEventListPanel: false,
  showInstrumentSelection: false,
  keySignature: 'C major',
  selectedMode: 'ionian',
  setSelectedMode: vi.fn(),
  playheadPosition: 0,
  isPlaying: false,
  autoScrollEnabled: false,
  bpm: 120,
  pianoRollScrollRequest: null,
  selectedNoteIds: [],
  automationRedrawVersion: 0,
};

let latestToolbarProps: { zoom: number; onZoomChange: (value: number) => void } | null = null;

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector?: (state: typeof storeState) => unknown) => selector ? selector(storeState) : storeState,
    {
      getState: () => ({ setAutoScrollEnabled: vi.fn() }),
      setState: vi.fn(),
    }
  ),
}));

vi.mock('../../core/state/KGPianoRollState', () => ({
  KGPianoRollState: {
    instance: () => pianoRollState,
    SNAP_OPTIONS: [{ value: 'none', labelKey: 'pianoRoll.snap.none' }],
    QUANT_POS_OPTIONS: [{ value: '1/8', labelKey: 'pianoRoll.quantize.1/8' }],
    QUANT_LEN_OPTIONS: [{ value: '1/8', labelKey: 'pianoRoll.quantize.1/8' }],
  },
  PIANO_ROLL_NO_SNAP: 'none',
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    FUNCTIONAL_CHORDS_DATA: { ionian: { name: 'Ionian' } },
    instance: () => ({
      getCurrentProject: () => mockProject,
      getSelectedItems: () => [],
      executeCommand: vi.fn(),
    }),
  },
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      get: vi.fn(),
      addChangeListener: () => () => undefined,
    }),
  },
}));

vi.mock('../../util/scaleUtil', () => ({
  getSuitableChords: vi.fn(() => ({})),
  noteNameToPitchClass: vi.fn(),
}));

vi.mock('../../util/dialogUtil', () => ({
  showAlert: vi.fn(),
  showPrompt: vi.fn(),
}));

vi.mock('./PianoRollHeader', () => ({ default: () => <div data-testid="header" /> }));
vi.mock('./NoteAttributeBar', () => ({ default: () => <div data-testid="note-attribute-bar" /> }));
vi.mock('./PianoRollContent', () => ({ default: () => <div data-testid="content" /> }));
vi.mock('./PianoRollToolbar', () => ({
  default: (props: { zoom: number; onZoomChange: (value: number) => void }) => {
    latestToolbarProps = props;
    return <div data-testid="toolbar">{props.zoom}x</div>;
  },
}));

vi.mock('./chordGuideUtil', async () => {
  const actual = await vi.importActual<typeof import('./chordGuideUtil')>('./chordGuideUtil');
  return {
    ...actual,
    resolveChordGuideContext: vi.fn(() => ({
      keySignature: 'C major',
      mode: 'ionian',
    })),
  };
});

describe('PianoRoll zoom persistence', () => {
  beforeEach(() => {
    latestToolbarProps = null;
    pianoRollState.zoom = 1;
    mockProject.setPianoRollZoom.mockReset();
    pianoRollState.getPianoRollZoom.mockClear();
    pianoRollState.setPianoRollZoom.mockClear();
    storeState.pianoRollHeight = 500;
    storeState.setPianoRollHeight.mockClear();
    document.documentElement.style.setProperty('--region-piano-key-width', '60px');
    document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
  });

  it('restores the previous zoom after closing and reopening the piano roll', () => {
    const firstRender = render(
      <PianoRoll
        onClose={vi.fn()}
        regionId="region-1"
      />
    );

    expect(latestToolbarProps?.zoom).toBe(1);

    latestToolbarProps?.onZoomChange(3);

    expect(pianoRollState.setPianoRollZoom).toHaveBeenCalledWith(3);
    expect(mockProject.setPianoRollZoom).toHaveBeenCalledWith(3);

    firstRender.unmount();

    render(
      <PianoRoll
        onClose={vi.fn()}
        regionId="region-1"
      />
    );

    expect(latestToolbarProps?.zoom).toBe(3);
  });

  it('resizes only the piano-roll height from its upper edge within the 200px pane limits', () => {
    const { container, unmount } = render(<PianoRoll onClose={vi.fn()} regionId="region-1" />);
    const panel = container.querySelector('.piano-roll-panel') as HTMLDivElement;
    const resizeEdge = container.querySelector('.piano-roll-resize-edge') as HTMLDivElement;

    Object.defineProperty(panel.parentElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ height: 800 }),
    });

    expect(panel.style.height).toBe('500px');
    expect(panel.style.width).toBe('');

    fireEvent.mouseDown(resizeEdge, { clientY: 500 });
    fireEvent.mouseMove(document, { clientY: 400 });
    expect(panel.style.height).toBe('600px');

    fireEvent.mouseMove(document, { clientY: 1000 });
    expect(panel.style.height).toBe('200px');
    expect(panel.style.width).toBe('');
    fireEvent.mouseUp(document);

    unmount();
    const reopened = render(<PianoRoll onClose={vi.fn()} regionId="region-1" />);
    expect((reopened.container.querySelector('.piano-roll-panel') as HTMLDivElement).style.height).toBe('200px');
  });
});
