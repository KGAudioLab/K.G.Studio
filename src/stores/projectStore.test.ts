import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { KGTrack } from '../core/track/KGTrack';
import { KGMidiTrack } from '../core/track/KGMidiTrack';

const pianoRollStateMocks = vi.hoisted(() => ({
  setSheetMusicViewEnabled: vi.fn(),
  setPianoRollZoom: vi.fn(),
}));

let mockTracks: KGTrack[] = [new KGMidiTrack('Track 1', 0, 'acoustic_grand_piano')];
const mockProject = {
  getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
  getMaxBars: () => 32,
  getBarWidthMultiplier: () => 1,
  getTracks: () => mockTracks,
  getBpm: () => 120,
  getKeySignature: () => 'C major',
  getName: () => 'Test Project',
  getSelectedMode: () => 'major',
  getIsLooping: () => false,
  getLoopingRange: () => [0, 0] as [number, number],
  getPianoRollZoom: () => 1,
};
let currentProject = mockProject;

const mockAudioInterface = {
  getTransportPosition: vi.fn().mockReturnValue(8),
  startAudioRecording: vi.fn().mockResolvedValue({ usedDeviceId: 'default', fellBackToDefault: false }),
  stopAudioRecording: vi.fn().mockResolvedValue(null),
  cancelAudioRecording: vi.fn().mockResolvedValue(undefined),
  removeTrackSynth: vi.fn(),
  removeTrackAudioPlayerBus: vi.fn(),
  createTrackAudioPlayerBus: vi.fn().mockResolvedValue(undefined),
  loadAudioBufferForTrack: vi.fn(),
  createTrackSynth: vi.fn(),
  setTrackVolume: vi.fn(),
  setTrackMute: vi.fn(),
  setTrackSolo: vi.fn(),
};

const configValues = new Map<string, unknown>([
  ['audio.input_device_id', 'default'],
]);

const mockCore = {
  getCurrentProject: () => currentProject,
  setCurrentProject: vi.fn((project: typeof mockProject) => {
    currentProject = project;
  }),
  setPlayheadUpdateCallback: vi.fn(),
  setPlaybackStateChangeCallback: vi.fn(),
  setLoopBoundaryReachedCallback: vi.fn(),
  getSelectedItems: () => [],
  onSelectionChanged: vi.fn(),
  canUndo: () => false,
  canRedo: () => false,
  getUndoDescription: () => '',
  getRedoDescription: () => '',
  setOnCommandHistoryChanged: vi.fn(),
  executeCommand: vi.fn(),
  undo: vi.fn(() => true),
  redo: vi.fn(() => true),
  clearSelectedItems: vi.fn(),
  getStatus: () => 'Ready',
  setStatus: vi.fn(),
  getPlayheadPosition: () => 0,
  setPlayheadPosition: vi.fn(),
  getIsPlaying: () => false,
  startPlaying: vi.fn().mockResolvedValue(undefined),
  stopPlaying: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: () => mockCore,
  },
}));

vi.mock('../core/audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => mockAudioInterface,
  },
}));

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      get: (key: string) => configValues.get(key),
      set: vi.fn(async (key: string, value: unknown) => {
        configValues.set(key, value);
      }),
    }),
  },
}));

vi.mock('../core/state/KGPianoRollState', () => ({
  KGPianoRollState: {
    instance: () => pianoRollStateMocks,
  },
}));

describe('projectStore piano roll state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    pianoRollStateMocks.setSheetMusicViewEnabled.mockReset();
    pianoRollStateMocks.setPianoRollZoom.mockReset();
    mockTracks = [new KGMidiTrack('Track 1', 0, 'acoustic_grand_piano')];
    currentProject = mockProject;
    mockCore.startPlaying.mockReset();
    mockCore.startPlaying.mockResolvedValue(undefined);
    mockCore.stopPlaying.mockReset();
    mockCore.stopPlaying.mockResolvedValue(undefined);
    mockCore.undo.mockReset();
    mockCore.undo.mockReturnValue(true);
    mockCore.redo.mockReset();
    mockCore.redo.mockReturnValue(true);
    mockCore.setLoopBoundaryReachedCallback.mockReset();
    mockAudioInterface.startAudioRecording.mockReset();
    mockAudioInterface.startAudioRecording.mockResolvedValue({ usedDeviceId: 'default', fellBackToDefault: false });
    mockAudioInterface.stopAudioRecording.mockReset();
    mockAudioInterface.stopAudioRecording.mockResolvedValue(null);
    mockAudioInterface.cancelAudioRecording.mockReset();
    mockAudioInterface.cancelAudioRecording.mockResolvedValue(undefined);
    mockAudioInterface.getTransportPosition.mockReset();
    mockAudioInterface.getTransportPosition.mockReturnValue(8);
    configValues.set('audio.input_device_id', 'default');
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
    expect(pianoRollStateMocks.setSheetMusicViewEnabled).toHaveBeenCalledWith(false);
    expect(state.showPianoRoll).toBe(true);
    expect(state.pianoRollMode).toBe('midi-edit');
    expect(state.activeRegionId).toBe('midi-b');
    expect(state.hybridAudioRegionId).toBeNull();
    expect(state.requestedSheetMusicViewEnabled).toBe(false);
    expect(state.pianoRollViewRequestVersion).toBe(1);
  });

  it('opens a MIDI region in sheet music view when requested', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().openHybridMode('midi-a', 'audio-a');
    });

    act(() => {
      useProjectStore.getState().openMidiPianoRollWithSheetMusicView('midi-b', true);
    });

    const state = useProjectStore.getState();
    expect(pianoRollStateMocks.setSheetMusicViewEnabled).toHaveBeenCalledWith(true);
    expect(state.showPianoRoll).toBe(true);
    expect(state.pianoRollMode).toBe('midi-edit');
    expect(state.activeRegionId).toBe('midi-b');
    expect(state.hybridAudioRegionId).toBeNull();
    expect(state.requestedSheetMusicViewEnabled).toBe(true);
    expect(state.pianoRollViewRequestVersion).toBe(1);
  });

  it('tracks playback preparation around startPlaying success', async () => {
    let resolveStart: (() => void) | null = null;
    mockCore.startPlaying.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStart = resolve;
    }));

    const { useProjectStore } = await import('./projectStore');

    const startPromise = useProjectStore.getState().startPlaying();
    expect(useProjectStore.getState().isPreparingPlayback).toBe(true);

    await act(async () => {
      resolveStart?.();
      await startPromise;
    });

    const state = useProjectStore.getState();
    expect(state.isPreparingPlayback).toBe(false);
    expect(state.isPlaying).toBe(true);
  });

  it('clears playback preparation if startPlaying fails', async () => {
    mockCore.startPlaying.mockRejectedValueOnce(new Error('prepare failed'));

    const { useProjectStore } = await import('./projectStore');

    await expect(useProjectStore.getState().startPlaying()).rejects.toThrow('prepare failed');
    expect(useProjectStore.getState().isPreparingPlayback).toBe(false);
  });

  it('ignores repeated startPlaying calls while already preparing', async () => {
    let resolveStart: (() => void) | null = null;
    mockCore.startPlaying.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStart = resolve;
    }));

    const { useProjectStore } = await import('./projectStore');

    const firstStart = useProjectStore.getState().startPlaying();
    const secondStart = useProjectStore.getState().startPlaying();

    expect(mockCore.startPlaying).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart?.();
      await Promise.all([firstStart, secondStart]);
    });
  });

  it('clears playback preparation when stopTransport is called during prepare', async () => {
    let resolveStart: (() => void) | null = null;
    mockCore.startPlaying.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveStart = resolve;
    }));

    const { useProjectStore } = await import('./projectStore');

    const startPromise = useProjectStore.getState().startPlaying();
    expect(useProjectStore.getState().isPreparingPlayback).toBe(true);

    await act(async () => {
      await useProjectStore.getState().stopTransport();
    });

    expect(useProjectStore.getState().isPreparingPlayback).toBe(false);

    await act(async () => {
      resolveStart?.();
      await startPromise;
    });
  });

  it('starts and stops audio-track recording without requiring a selected region', async () => {
    const { KGAudioTrack } = await import('../core/track/KGAudioTrack');
    const audioTrack = new KGAudioTrack('Audio 1', 1);
    audioTrack.setTrackIndex(0);
    mockTracks = [audioTrack];

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setSelectedTrack('1');
      useProjectStore.getState().setPlayheadPosition(8);
    });

    await act(async () => {
      await useProjectStore.getState().startRecording();
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mockCore.startPlaying).toHaveBeenCalledWith({ preserveLoopPreroll: false });
    expect(mockAudioInterface.startAudioRecording).toHaveBeenCalled();
    expect(useProjectStore.getState().recordingMode).toBe('audio');
    expect(useProjectStore.getState().recordingCommitStartBeatAbsolute).toBe(8);

    await act(async () => {
      await useProjectStore.getState().stopTransport();
    });

    expect(mockAudioInterface.stopAudioRecording).toHaveBeenCalled();
    expect(useProjectStore.getState().isRecording).toBe(false);
    expect(useProjectStore.getState().recordingMode).toBeNull();
    expect(useProjectStore.getState().playheadPosition).toBe(8);
  });

  it('bumps track automation redraw version on undo and redo', async () => {
    const { useProjectStore } = await import('./projectStore');

    const initialVersion = useProjectStore.getState().trackAutomationRedrawVersion;

    act(() => {
      useProjectStore.getState().undo();
    });

    expect(useProjectStore.getState().trackAutomationRedrawVersion).toBe(initialVersion + 1);

    act(() => {
      useProjectStore.getState().redo();
    });

    expect(useProjectStore.getState().trackAutomationRedrawVersion).toBe(initialVersion + 2);
  });

  it('restores Chat after closing Settings when Chat was active on entry', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().toggleChatBox();
      useProjectStore.getState().setShowSettings(true);
    });

    let state = useProjectStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.settingsReturnSidePanel).toBe('chat');

    act(() => {
      useProjectStore.getState().setShowSettings(false);
    });

    state = useProjectStore.getState();
    expect(state.showSettings).toBe(false);
    expect(state.showChatBox).toBe(true);
    expect(state.showKGOnePanel).toBe(false);
    expect(state.showEventListPanel).toBe(false);
  });

  it('restores K.G.One after closing Settings when K.G.One was active on entry', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().toggleKGOnePanel();
      useProjectStore.getState().setShowSettings(true);
      useProjectStore.getState().setShowSettings(false);
    });

    const state = useProjectStore.getState();
    expect(state.showSettings).toBe(false);
    expect(state.showKGOnePanel).toBe(true);
    expect(state.showChatBox).toBe(false);
    expect(state.showEventListPanel).toBe(false);
  });

  it('restores no side panel after closing Settings when none was active on entry', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().toggleChatBox();
      useProjectStore.getState().toggleChatBox();
      useProjectStore.getState().setShowSettings(true);
      useProjectStore.getState().setShowSettings(false);
    });

    const state = useProjectStore.getState();
    expect(state.showSettings).toBe(false);
    expect(state.showChatBox).toBe(false);
    expect(state.showKGOnePanel).toBe(false);
    expect(state.showEventListPanel).toBe(false);
    expect(state.settingsReturnSidePanel).toBeNull();
    expect(state.lastActiveSidePanel).toBe('chat');
  });

  it('opens Event List and exits Settings when Event List is activated from Settings', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().toggleChatBox();
      useProjectStore.getState().setShowSettings(true);
      useProjectStore.getState().activateSidePanel('eventList');
    });

    const state = useProjectStore.getState();
    expect(state.showSettings).toBe(false);
    expect(state.showEventListPanel).toBe(true);
    expect(state.showChatBox).toBe(false);
    expect(state.showKGOnePanel).toBe(false);
    expect(state.settingsReturnSidePanel).toBeNull();
    expect(state.lastActiveSidePanel).toBe('eventList');
  });
});
