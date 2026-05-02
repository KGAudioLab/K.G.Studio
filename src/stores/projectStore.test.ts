import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { KGMidiTrack } from '../core/track/KGMidiTrack';

const mockProject = {
  getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
  getMaxBars: () => 32,
  getBarWidthMultiplier: () => 1,
  getTracks: () => [new KGMidiTrack('Track 1', 0, 'acoustic_grand_piano')],
  getBpm: () => 120,
  getKeySignature: () => 'C major',
  getName: () => 'Test Project',
  getSelectedMode: () => 'major',
  getIsLooping: () => false,
  getLoopingRange: () => null,
};

const mockCore = {
  getCurrentProject: () => mockProject,
  setPlayheadUpdateCallback: vi.fn(),
  setPlaybackStateChangeCallback: vi.fn(),
  getSelectedItems: () => [],
  onSelectionChanged: vi.fn(),
  canUndo: () => false,
  canRedo: () => false,
  getUndoDescription: () => '',
  getRedoDescription: () => '',
  setOnCommandHistoryChanged: vi.fn(),
  executeCommand: vi.fn(),
  clearSelectedItems: vi.fn(),
  getStatus: () => 'Ready',
  getPlayheadPosition: () => 0,
  getIsPlaying: () => false,
};

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => mockCore,
  },
}));

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      get: () => false,
    }),
  },
}));

describe('projectStore piano roll state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('clears hybrid state when opening a MIDI region', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().openHybridMode('midi-a', 'audio-a');
    });

    let state = useProjectStore.getState();
    expect(state.pianoRollMode).toBe('hybrid');
    expect(state.activeRegionId).toBe('midi-a');
    expect(state.hybridAudioRegionId).toBe('audio-a');

    act(() => {
      useProjectStore.getState().openMidiPianoRoll('midi-b');
    });

    state = useProjectStore.getState();
    expect(state.showPianoRoll).toBe(true);
    expect(state.pianoRollMode).toBe('midi-edit');
    expect(state.activeRegionId).toBe('midi-b');
    expect(state.hybridAudioRegionId).toBeNull();
  });
});
