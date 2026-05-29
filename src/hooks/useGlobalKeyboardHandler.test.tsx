import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobalKeyboardHandler } from './useGlobalKeyboardHandler';
import { showAlert } from '../util/dialogUtil';

const regionEditUtilMocks = vi.hoisted(() => ({
  splitSelectedRegionAtPlayhead: vi.fn(),
  mergeSelectedMidiRegions: vi.fn(),
}));

const MockMidiRegion = vi.hoisted(() => class {
  private readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  getId() {
    return this.id;
  }
});

let mockTracks: Array<{ getRegions: () => Array<{ getId: () => string }> }> = [];

const storeState = {
  undo: vi.fn(),
  redo: vi.fn(),
  setStatus: vi.fn(),
  isPlaying: false,
  startPlaying: vi.fn(),
  stopTransport: vi.fn(),
  toggleLoop: vi.fn(),
  projectName: 'Test Project',
  savedProjectName: 'Test Project',
  setSavedProjectName: vi.fn(),
  setProjectName: vi.fn(),
  isRecording: false,
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  activeRegionId: null,
  selectedRegionIds: ['region-a', 'region-b'],
  selectedNoteIds: [],
  setActiveRegionId: vi.fn(),
  setShowPianoRoll: vi.fn(),
  showPianoRoll: false,
  openMidiPianoRoll: vi.fn(),
  openMidiPianoRollWithSheetMusicView: vi.fn(),
  openAudioWaveformViewer: vi.fn(),
  openSpectrogramViewer: vi.fn(),
  playheadPosition: 12,
  refreshProjectState: vi.fn(),
  pianoRollMode: 'midi-edit' as const,
};

type StoreState = typeof storeState;

vi.mock('../stores/projectStore', () => ({
  useProjectStore: (selector?: unknown) => (
    selector ? (selector as (state: StoreState) => unknown)(storeState) : storeState
  ),
}));

vi.mock('../util/osUtil', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../util/osUtil')>();
  return {
    ...actual,
    matchesKeyboardShortcut: (event: KeyboardEvent, shortcut: string) => {
      if (shortcut === 'ctrl+t') {
        return event.ctrlKey && event.key.toLowerCase() === 't';
      }
      if (shortcut === 'ctrl+j') {
        return event.ctrlKey && event.key.toLowerCase() === 'j';
      }
      return false;
    },
  };
});

vi.mock('../util/copyPasteUtil', () => ({
  handleCopyOperation: vi.fn(() => false),
  handlePasteOperation: vi.fn(() => false),
}));

vi.mock('../util/saveUtil', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      get: (path: string) => {
        const shortcuts: Record<string, string> = {
          'hotkeys.main.undo': 'ctrl+z',
          'hotkeys.main.redo': 'ctrl+shift+z',
          'hotkeys.main.copy': 'ctrl+c',
          'hotkeys.main.paste': 'ctrl+v',
          'hotkeys.main.select_all': 'ctrl+a',
          'hotkeys.main.play': 'space',
          'hotkeys.main.loop': 'c',
          'hotkeys.main.save': 'ctrl+s',
          'hotkeys.main.record': 'r',
          'hotkeys.main.split_region': 'ctrl+t',
          'hotkeys.main.merge_regions': 'ctrl+j',
        };
        return shortcuts[path];
      },
    }),
  },
}));

vi.mock('../util/selectionUtil', () => ({
  selectAllNotesInActiveRegion: vi.fn(),
}));

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getCurrentProject: () => ({
        getTracks: () => mockTracks,
      }),
    }),
  },
}));

vi.mock('../core/midi-input/KGMidiInput', () => ({
  KGMidiInput: {
    instance: () => ({
      getConnectedInputCount: () => 0,
    }),
  },
}));

vi.mock('../core/region/KGMidiRegion', () => ({
  KGMidiRegion: MockMidiRegion,
}));

vi.mock('../core/track/KGAudioTrack', () => ({
  KGAudioTrack: class {},
}));

vi.mock('../util/regionEditUtil', () => ({
  splitSelectedRegionAtPlayhead: regionEditUtilMocks.splitSelectedRegionAtPlayhead,
  mergeSelectedMidiRegions: regionEditUtilMocks.mergeSelectedMidiRegions,
}));

vi.mock('../util/dialogUtil', () => ({
  showAlert: vi.fn(),
}));

const HookHarness = () => {
  useGlobalKeyboardHandler();
  return null;
};

describe('useGlobalKeyboardHandler region shortcuts', () => {
  beforeEach(() => {
    mockTracks = [];
    regionEditUtilMocks.splitSelectedRegionAtPlayhead.mockReset();
    regionEditUtilMocks.mergeSelectedMidiRegions.mockReset();
    storeState.setStatus.mockClear();
    storeState.setShowPianoRoll.mockClear();
    storeState.showPianoRoll = false;
    storeState.activeRegionId = null;
    storeState.selectedRegionIds = ['region-a', 'region-b'];
    storeState.openMidiPianoRoll.mockClear();
    storeState.openMidiPianoRollWithSheetMusicView.mockClear();
    storeState.openAudioWaveformViewer.mockClear();
    storeState.openSpectrogramViewer.mockClear();
    vi.mocked(showAlert).mockClear();
  });

  it('triggers split on Ctrl+T', async () => {
    regionEditUtilMocks.splitSelectedRegionAtPlayhead.mockResolvedValue('Split 1 note at beat 12.00');

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 't', ctrlKey: true });

    await waitFor(() => {
      expect(regionEditUtilMocks.splitSelectedRegionAtPlayhead).toHaveBeenCalledWith({
        selectedRegionIds: ['region-a', 'region-b'],
        playheadPosition: 12,
        refreshProjectState: storeState.refreshProjectState,
      });
    });

    await waitFor(() => {
      expect(storeState.setStatus).toHaveBeenCalledWith('Split 1 note at beat 12.00');
    });
  });

  it('triggers merge on Ctrl+J', async () => {
    regionEditUtilMocks.mergeSelectedMidiRegions.mockResolvedValue('Merged 2 MIDI regions');

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'j', ctrlKey: true });

    await waitFor(() => {
      expect(regionEditUtilMocks.mergeSelectedMidiRegions).toHaveBeenCalledWith({
        selectedRegionIds: ['region-a', 'region-b'],
        refreshProjectState: storeState.refreshProjectState,
      });
    });

    await waitFor(() => {
      expect(storeState.setStatus).toHaveBeenCalledWith('Merged 2 MIDI regions');
    });
  });

  it('opens a selected MIDI region in piano roll view on E', () => {
    mockTracks = [
      {
        getRegions: () => [new MockMidiRegion('region-b')],
      },
    ];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'e' });

    expect(storeState.openMidiPianoRollWithSheetMusicView).toHaveBeenCalledWith('region-b', false);
    expect(storeState.openAudioWaveformViewer).not.toHaveBeenCalled();
    expect(storeState.openSpectrogramViewer).not.toHaveBeenCalled();
  });

  it('opens a selected MIDI region in sheet music view on N', () => {
    mockTracks = [
      {
        getRegions: () => [new MockMidiRegion('region-b')],
      },
    ];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'n' });

    expect(storeState.openMidiPianoRollWithSheetMusicView).toHaveBeenCalledWith('region-b', true);
    expect(storeState.setShowPianoRoll).not.toHaveBeenCalled();
  });

  it('shows the editor alert on N when no region is selected', () => {
    storeState.selectedRegionIds = [];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'n' });

    expect(showAlert).toHaveBeenCalledWith('Please select a region to open the editor.');
    expect(storeState.openMidiPianoRollWithSheetMusicView).not.toHaveBeenCalled();
  });

  it('does not open spectrogram on N for an audio region', () => {
    mockTracks = [
      {
        getRegions: () => [
          {
            getId: () => 'region-b',
          },
        ],
      },
    ];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'n' });

    expect(showAlert).toHaveBeenCalledWith('Sheet music view is only available for MIDI regions.');
    expect(storeState.openSpectrogramViewer).not.toHaveBeenCalled();
    expect(storeState.openAudioWaveformViewer).not.toHaveBeenCalled();
    expect(storeState.openMidiPianoRollWithSheetMusicView).not.toHaveBeenCalled();
  });

  it('opens a selected audio region in waveform view on E', () => {
    mockTracks = [
      {
        getRegions: () => [
          {
            getId: () => 'region-b',
          },
        ],
      },
    ];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'e' });

    expect(storeState.openAudioWaveformViewer).toHaveBeenCalledWith('region-b');
    expect(storeState.openMidiPianoRollWithSheetMusicView).not.toHaveBeenCalled();
    expect(storeState.openSpectrogramViewer).not.toHaveBeenCalled();
  });

  it('does not close the editor when N is pressed while piano roll is already open', () => {
    storeState.showPianoRoll = true;
    mockTracks = [
      {
        getRegions: () => [new MockMidiRegion('region-b')],
      },
    ];

    render(<HookHarness />);
    fireEvent.keyDown(document.body, { key: 'n' });

    expect(storeState.setShowPianoRoll).not.toHaveBeenCalled();
    expect(storeState.openMidiPianoRollWithSheetMusicView).toHaveBeenCalledWith('region-b', true);
  });
});
