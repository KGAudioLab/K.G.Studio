import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Toolbar from './Toolbar';

const storeState = {
  projectName: 'Test Project',
  setProjectName: vi.fn(),
  savedProjectName: 'Test Project',
  setSavedProjectName: vi.fn(),
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  keySignature: 'C major',
  setStatus: vi.fn(),
  isPlaying: false,
  isPreparingPlayback: false,
  startPlaying: vi.fn(),
  stopTransport: vi.fn(),
  setPlayheadPosition: vi.fn(),
  currentTime: '0:00',
  setBpm: vi.fn(),
  setTimeSignature: vi.fn(),
  setKeySignature: vi.fn(),
  maxBars: 32,
  setMaxBars: vi.fn(),
  barWidthMultiplier: 1,
  setBarWidthMultiplier: vi.fn(),
  isLooping: false,
  toggleLoop: vi.fn(),
  canUndo: false,
  canRedo: false,
  undoDescription: null,
  redoDescription: null,
  undo: vi.fn(),
  redo: vi.fn(),
  toggleChatBox: vi.fn(),
  toggleSettings: vi.fn(),
  toggleKGOnePanel: vi.fn(),
  toggleEventListPanel: vi.fn(),
  activateSidePanel: vi.fn(),
  showKGOnePanel: true,
  showEventListPanel: false,
  showChatBox: true,
  showSettings: true,
  cleanupProjectState: vi.fn(),
  toggleMetronome: vi.fn(),
  isMetronomeEnabled: false,
  isRecording: false,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  showPianoRoll: false,
  setShowPianoRoll: vi.fn(),
  activeRegionId: null,
  setActiveRegionId: vi.fn(),
  selectedRegionIds: [] as string[],
  selectedTrackId: null,
  playheadPosition: 0,
  refreshProjectState: vi.fn(),
  requestMainContentScroll: vi.fn(),
  requestPianoRollScroll: vi.fn(),
  tracks: [] as unknown[],
};

type StoreState = typeof storeState;
// eslint-disable-next-line no-unused-vars
type StoreSelector = (state: StoreState) => unknown;

vi.mock('../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector?: StoreSelector) => (selector ? selector(storeState) : storeState),
    { getState: () => storeState }
  ),
}));

vi.mock('../constants/uiConstants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants/uiConstants')>();
  return {
    ...actual,
    DEBUG_MODE: { ...actual.DEBUG_MODE, TOOLBAR: false },
  };
});

vi.mock('../constants/coreConstants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants/coreConstants')>();
  return {
    ...actual,
    KEY_SIGNATURE_MAP: {
      ...actual.KEY_SIGNATURE_MAP,
      'C major': actual.KEY_SIGNATURE_MAP['C major'],
      'G major': actual.KEY_SIGNATURE_MAP['G major'],
      'E minor': actual.KEY_SIGNATURE_MAP['E minor'],
      'Gb major': actual.KEY_SIGNATURE_MAP['Gb major'],
      'F# major': actual.KEY_SIGNATURE_MAP['F# major'],
      'Eb minor': actual.KEY_SIGNATURE_MAP['Eb minor'],
      'D# minor': actual.KEY_SIGNATURE_MAP['D# minor'],
    },
  };
});

vi.mock('../util/saveUtil', () => ({ saveProject: vi.fn() }));
vi.mock('../core/io/KGProjectStorage', () => ({ KGProjectStorage: { getInstance: vi.fn() } }));
vi.mock('../util/projectNameUtil', () => ({
  isValidProjectName: vi.fn(() => true),
  isReservedProjectName: vi.fn(() => false),
  RESERVED_PROJECT_NAME: 'Untitled Project',
}));
vi.mock('../core/KGCore', () => ({ KGCore: { instance: vi.fn(() => ({ getCurrentProject: vi.fn(() => ({ getTracks: () => [] })) })) } }));
vi.mock('../core/midi-input/KGMidiInput', () => ({ KGMidiInput: { instance: vi.fn(() => ({ getConnectedInputCount: () => 0 })) } }));
vi.mock('../core/region/KGMidiRegion', () => ({ KGMidiRegion: class {} }));
vi.mock('../core/track/KGAudioTrack', () => ({ KGAudioTrack: class {} }));
vi.mock('class-transformer', () => ({
  plainToInstance: vi.fn(),
  Expose: () => () => undefined,
  Type: () => () => undefined,
  Transform: () => () => undefined,
}));
vi.mock('../core/state/KGMainContentState', () => ({ KGMainContentState: {} }));
vi.mock('../util/regionDeleteUtil', () => ({ regionDeleteManager: { deleteSelectedRegions: vi.fn(() => false) } }));
vi.mock('../core/commands/region/SplitRegionCommand', () => ({ SplitRegionCommand: class {} }));
vi.mock('../core/commands/region/MergeMidiRegionsCommand', () => ({ MergeMidiRegionsCommand: class {} }));
const regionEditUtilMocks = vi.hoisted(() => ({
  splitSelectedRegionAtPlayheadMock: vi.fn(),
  mergeSelectedMidiRegionsMock: vi.fn(),
}));
vi.mock('../util/regionEditUtil', () => ({
  splitSelectedRegionAtPlayhead: regionEditUtilMocks.splitSelectedRegionAtPlayheadMock,
  mergeSelectedMidiRegions: regionEditUtilMocks.mergeSelectedMidiRegionsMock,
}));
vi.mock('../util/copyPasteUtil', () => ({
  handleCopyOperation: vi.fn(() => false),
  handlePasteOperation: vi.fn(() => false),
}));
vi.mock('../util/midiUtil', () => ({
  convertProjectToMidi: vi.fn(),
  convertMidiToProject: vi.fn(),
}));
vi.mock('../core/audio-interface/KGOfflineRenderer', () => ({ KGOfflineRenderer: { instance: vi.fn(() => ({})) } }));
vi.mock('./common/FileImportModal', () => ({ default: () => null }));
vi.mock('./common/LoadingOverlay', () => ({ default: () => null }));
vi.mock('./common/OpenProjectModal', () => ({ default: () => null }));
vi.mock('../util/chatUtil', () => ({ clearChatHistoryAndUI: vi.fn() }));
vi.mock('./common/icons/PianoIcon', () => ({ default: () => <span>piano</span> }));
vi.mock('./common/icons/MetronomeIcon', () => ({ default: () => <span>metro</span> }));
vi.mock('../core/config/ConfigManager', () => ({ ConfigManager: { instance: vi.fn(() => ({})) } }));
vi.mock('../util/dialogUtil', () => ({
  showAlert: vi.fn(),
  showChoice: vi.fn(),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showTimeSigPrompt: vi.fn(),
}));
vi.mock('vexflow', () => {
  class MockRenderer {
    static Backends = { SVG: 'svg' };
    private readonly host: HTMLElement;

    constructor(host: HTMLElement) {
      this.host = host;
    }

    resize() {}

    getContext() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.host.appendChild(svg);
      return {};
    }
  }

  class MockStave {
    constructor() {}

    addClef() {
      return this;
    }

    addKeySignature() {
      return this;
    }

    setContext() {
      return this;
    }

    draw() {
      return this;
    }
  }

  return {
    Renderer: MockRenderer,
    Stave: MockStave,
  };
});

describe('Toolbar settings side-panel behavior', () => {
  beforeEach(() => {
    regionEditUtilMocks.splitSelectedRegionAtPlayheadMock.mockReset();
    regionEditUtilMocks.mergeSelectedMidiRegionsMock.mockReset();
    storeState.toggleChatBox.mockClear();
    storeState.toggleKGOnePanel.mockClear();
    storeState.toggleEventListPanel.mockClear();
    storeState.activateSidePanel.mockClear();
    storeState.setStatus.mockClear();
    storeState.showSettings = true;
    storeState.showChatBox = true;
    storeState.showKGOnePanel = true;
    storeState.showEventListPanel = false;
    storeState.keySignature = 'C major';
    storeState.setKeySignature.mockClear();
  });

  it('suppresses active styling for side-panel buttons while Settings is visible', () => {
    render(<Toolbar />);

    expect(screen.getByTitle('K.G.One Music Generator')).not.toHaveClass('active');
    expect(screen.getByTitle('Chat')).not.toHaveClass('active');
    expect(screen.getByTitle('Event List Editor')).not.toHaveClass('active');
  });

  it('activates Event List directly instead of toggling when clicked during Settings', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByTitle('Event List Editor'));

    expect(storeState.activateSidePanel).toHaveBeenCalledWith('eventList');
    expect(storeState.toggleEventListPanel).not.toHaveBeenCalled();
  });

  it('routes the split toolbar button through the shared split helper', async () => {
    storeState.selectedRegionIds = ['region-1'];
    storeState.playheadPosition = 12;
    regionEditUtilMocks.splitSelectedRegionAtPlayheadMock.mockResolvedValue('Split 1 note at beat 12.00');

    render(<Toolbar />);
    fireEvent.click(screen.getByTitle('Split Region at Playhead'));

    await waitFor(() => {
      expect(regionEditUtilMocks.splitSelectedRegionAtPlayheadMock).toHaveBeenCalledWith({
        selectedRegionIds: ['region-1'],
        playheadPosition: 12,
        refreshProjectState: storeState.refreshProjectState,
      });
    });

    await waitFor(() => {
      expect(storeState.setStatus).toHaveBeenCalledWith('Split 1 note at beat 12.00');
    });
  });

  it('opens and closes the key signature popup from the toolbar trigger', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: /choose key signature/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Major')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('updates the store when a major or minor key is selected', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: /choose key signature/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Select G major' }));
    expect(storeState.setKeySignature).toHaveBeenCalledWith('G major');
    expect(storeState.setStatus).toHaveBeenCalledWith('Key signature changed to G major');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /choose key signature/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Select E minor' }));
    expect(storeState.setKeySignature).toHaveBeenCalledWith('E minor');
    expect(storeState.setStatus).toHaveBeenCalledWith('Key signature changed to E minor');
  });
});
