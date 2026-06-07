import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { KGTrack } from '../core/track/KGTrack';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { createDefaultGlobalTracks } from '../core/global-track';

const pianoRollStateMocks = vi.hoisted(() => ({
  setSheetMusicViewEnabled: vi.fn(),
  setPianoRollZoom: vi.fn(),
}));

const audioStorageMocks = vi.hoisted(() => ({
  loadAudioFile: vi.fn(),
}));

const toneMocks = vi.hoisted(() => {
  const decodeAudioData = vi.fn();
  const toneBufferSet = vi.fn();

  class MockToneAudioBuffer {
    public set = toneBufferSet;
  }

  return {
    decodeAudioData,
    toneBufferSet,
    ToneAudioBuffer: MockToneAudioBuffer,
  };
});

let mockTracks: KGTrack[] = [new KGMidiTrack('Track 1', 0, 'acoustic_grand_piano')];
let mockIsMetronomeEnabled = false;
let mockShowGlobalTracks = false;
const mockProject = {
  getTimeSignature: () => ({ numerator: 4, denominator: 4 }),
  getMaxBars: () => 32,
  getBarWidthMultiplier: () => 1,
  getTracks: () => mockTracks,
  getGlobalTracks: () => createDefaultGlobalTracks(),
  getBpm: () => 120,
  getKeySignature: () => 'C major',
  getName: () => 'Test Project',
  getSelectedMode: () => 'major',
  getIsLooping: () => false,
  getIsMetronomeEnabled: () => mockIsMetronomeEnabled,
  setIsMetronomeEnabled: vi.fn((value: boolean) => {
    mockIsMetronomeEnabled = value;
  }),
  getShowGlobalTracks: () => mockShowGlobalTracks,
  setShowGlobalTracks: vi.fn((value: boolean) => {
    mockShowGlobalTracks = value;
  }),
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
  hasTrackAudioPlayerBus: vi.fn().mockReturnValue(true),
  hasAudioBufferForTrack: vi.fn().mockReturnValue(false),
  getAudioBuffer: vi.fn(),
  loadAudioBufferForTrack: vi.fn(),
  createTrackSynth: vi.fn(),
  setTrackVolume: vi.fn(),
  setTrackMute: vi.fn(),
  setTrackSolo: vi.fn(),
  setMetronomeEnabled: vi.fn(),
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

vi.mock('../core/io/KGAudioFileStorage', () => ({
  KGAudioFileStorage: {
    loadAudioFile: audioStorageMocks.loadAudioFile,
  },
}));

vi.mock('tone', () => ({
  getContext: () => ({
    rawContext: {
      decodeAudioData: toneMocks.decodeAudioData,
    },
  }),
  ToneAudioBuffer: toneMocks.ToneAudioBuffer,
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
    mockAudioInterface.hasTrackAudioPlayerBus.mockReset();
    mockAudioInterface.hasTrackAudioPlayerBus.mockReturnValue(true);
    mockAudioInterface.hasAudioBufferForTrack.mockReset();
    mockAudioInterface.hasAudioBufferForTrack.mockReturnValue(false);
    mockAudioInterface.getAudioBuffer.mockReset();
    mockAudioInterface.createTrackAudioPlayerBus.mockReset();
    mockAudioInterface.createTrackAudioPlayerBus.mockResolvedValue(undefined);
    mockAudioInterface.loadAudioBufferForTrack.mockReset();
    mockAudioInterface.setMetronomeEnabled.mockReset();
    audioStorageMocks.loadAudioFile.mockReset();
    toneMocks.decodeAudioData.mockReset();
    toneMocks.toneBufferSet.mockReset();
    mockIsMetronomeEnabled = false;
    mockShowGlobalTracks = false;
    mockProject.setIsMetronomeEnabled.mockClear();
    mockProject.setShowGlobalTracks.mockClear();
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

  it('opens an audio region in waveform view and clears hybrid state', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().openHybridMode('midi-a', 'audio-a');
    });

    act(() => {
      useProjectStore.getState().openAudioWaveformViewer('audio-b');
    });

    const state = useProjectStore.getState();
    expect(state.showPianoRoll).toBe(true);
    expect(state.pianoRollMode).toBe('audio-waveform');
    expect(state.activeRegionId).toBe('audio-b');
    expect(state.hybridAudioRegionId).toBeNull();
    expect(state.requestedSheetMusicViewEnabled).toBe(false);
  });

  it('initializes persisted metronome and global-track visibility state from the project', async () => {
    mockIsMetronomeEnabled = true;
    mockShowGlobalTracks = true;

    const { useProjectStore } = await import('./projectStore');

    const state = useProjectStore.getState();
    expect(state.isMetronomeEnabled).toBe(true);
    expect(state.showGlobalTracks).toBe(true);
  });

  it('persists metronome toggles to the project and audio interface', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().toggleMetronome();
    });

    const state = useProjectStore.getState();
    expect(mockProject.setIsMetronomeEnabled).toHaveBeenCalledWith(true);
    expect(mockAudioInterface.setMetronomeEnabled).toHaveBeenCalledWith(true);
    expect(state.isMetronomeEnabled).toBe(true);
  });

  it('persists global-track visibility changes to the project', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setShowGlobalTracks(true);
    });

    const state = useProjectStore.getState();
    expect(mockProject.setShowGlobalTracks).toHaveBeenCalledWith(true);
    expect(state.showGlobalTracks).toBe(true);
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

  it('rehydrates missing audio buffers during refreshProjectState', async () => {
    const audioTrack = new KGAudioTrack('Audio 1', 1);
    audioTrack.setTrackIndex(0);
    audioTrack.setRegions([
      new KGAudioRegion('audio-region-1', '1', 0, 'clip.wav', 0, 4, 'audio-file-1.wav', 'clip.wav', 2.5),
    ]);
    mockTracks = [audioTrack];

    const decodedBuffer = { duration: 2.5 } as AudioBuffer;
    audioStorageMocks.loadAudioFile.mockResolvedValue(new ArrayBuffer(16));
    toneMocks.decodeAudioData.mockResolvedValue(decodedBuffer);

    const { useProjectStore } = await import('./projectStore');

    await act(async () => {
      useProjectStore.getState().refreshProjectState();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(audioStorageMocks.loadAudioFile).toHaveBeenCalledWith('Test Project', 'audio-file-1.wav');
    expect(toneMocks.decodeAudioData).toHaveBeenCalled();
    expect(mockAudioInterface.loadAudioBufferForTrack).toHaveBeenCalledWith(
      '1',
      'audio-file-1.wav',
      expect.any(toneMocks.ToneAudioBuffer),
    );
  });

  it('reloads a restored audio track buffer on undo', async () => {
    const restoredTrack = new KGAudioTrack('Audio 1', 1);
    restoredTrack.setTrackIndex(0);
    const restoredRegion = new KGAudioRegion(
      'audio-region-1',
      '1',
      0,
      'clip.wav',
      0,
      4,
      'audio-file-1.wav',
      'clip.wav',
      2.5,
    );
    restoredTrack.setRegions([restoredRegion]);

    mockTracks = [];
    mockCore.undo.mockImplementationOnce(() => {
      mockTracks = [restoredTrack];
      return true;
    });

    const decodedBuffer = { duration: 2.5 } as AudioBuffer;
    audioStorageMocks.loadAudioFile.mockResolvedValue(new ArrayBuffer(16));
    toneMocks.decodeAudioData.mockResolvedValue(decodedBuffer);

    const { useProjectStore } = await import('./projectStore');
    const initialWaveformVersion = useProjectStore.getState().audioWaveformRedrawVersion;

    await act(async () => {
      useProjectStore.getState().undo();
      await Promise.resolve();
      await Promise.resolve();
    });

    const state = useProjectStore.getState();
    expect(state.tracks).toHaveLength(1);
    const restoredTrackState = state.tracks[0] as KGAudioTrack;
    expect((restoredTrackState.getRegions()[0] as KGAudioRegion).getAudioFileId()).toBe('audio-file-1.wav');
    expect(mockAudioInterface.loadAudioBufferForTrack).toHaveBeenCalledWith(
      '1',
      'audio-file-1.wav',
      expect.any(toneMocks.ToneAudioBuffer),
    );
    expect(state.audioWaveformRedrawVersion).toBeGreaterThan(initialWaveformVersion);
  });

  it('does not attempt audio buffer hydration for MIDI-only undo', async () => {
    mockTracks = [new KGMidiTrack('Track 1', 1, 'acoustic_grand_piano')];

    const { useProjectStore } = await import('./projectStore');

    await act(async () => {
      useProjectStore.getState().undo();
      await Promise.resolve();
    });

    expect(audioStorageMocks.loadAudioFile).not.toHaveBeenCalled();
    expect(mockAudioInterface.loadAudioBufferForTrack).not.toHaveBeenCalled();
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
