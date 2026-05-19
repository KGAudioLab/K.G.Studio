import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobalKeyboardHandler } from './useGlobalKeyboardHandler';

const regionEditUtilMocks = vi.hoisted(() => ({
  splitSelectedRegionAtPlayhead: vi.fn(),
  mergeSelectedMidiRegions: vi.fn(),
}));

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
  setActiveRegionId: vi.fn(),
  setShowPianoRoll: vi.fn(),
  showPianoRoll: false,
  openMidiPianoRoll: vi.fn(),
  openSpectrogramViewer: vi.fn(),
  playheadPosition: 12,
  refreshProjectState: vi.fn(),
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
        getTracks: () => [],
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
  KGMidiRegion: class {},
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
    regionEditUtilMocks.splitSelectedRegionAtPlayhead.mockReset();
    regionEditUtilMocks.mergeSelectedMidiRegions.mockReset();
    storeState.setStatus.mockClear();
  });

  it('triggers split on Ctrl+T', async () => {
    regionEditUtilMocks.splitSelectedRegionAtPlayhead.mockResolvedValue('Split region at beat 12.00');

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
      expect(storeState.setStatus).toHaveBeenCalledWith('Split region at beat 12.00');
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
});
