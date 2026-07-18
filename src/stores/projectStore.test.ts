import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { KGTrack } from '../core/track/KGTrack';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { createDefaultGlobalTracks } from '../core/global-track';
import { getAudioRegionDisplayLengthBeats } from '../util/globalTrackUtil';

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
let mockPlayheadPosition = 0;
let mockSelectedItems: Array<{ getId: () => string; select: () => void; deselect: () => void; isSelected: () => boolean }> = [];
let mockCopiedItems: Array<{ getId: () => string }> = [];
const selectionChangedCallbacks: Array<() => void> = [];
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
  getPlayheadPosition: () => mockPlayheadPosition,
  setPlayheadPosition: vi.fn((position: number) => {
    mockPlayheadPosition = position;
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
  getSelectedItems: () => mockSelectedItems,
  getCopiedItems: () => mockCopiedItems,
  onSelectionChanged: vi.fn((callback: () => void) => {
    selectionChangedCallbacks.push(callback);
  }),
  canUndo: () => false,
  canRedo: () => false,
  getUndoDescription: () => '',
  getRedoDescription: () => '',
  setOnCommandHistoryChanged: vi.fn(),
  executeCommand: vi.fn(),
  undo: vi.fn(() => true),
  redo: vi.fn(() => true),
  clearSelectedItems: vi.fn(() => {
    mockSelectedItems = [];
    selectionChangedCallbacks.forEach(callback => callback());
  }),
  addSelectedItems: vi.fn((items: Array<{ getId: () => string; select: () => void; deselect: () => void; isSelected: () => boolean }>) => {
    const incomingIds = new Set(items.map(item => item.getId()));
    mockSelectedItems = mockSelectedItems.filter(item => !incomingIds.has(item.getId()));
    mockSelectedItems.push(...items);
    selectionChangedCallbacks.forEach(callback => callback());
  }),
  getStatus: () => 'Ready',
  setStatus: vi.fn(),
  getPlayheadPosition: () => mockPlayheadPosition,
  setPlayheadPosition: vi.fn((position: number) => {
    mockPlayheadPosition = position;
  }),
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
    mockPlayheadPosition = 0;
    mockCore.startPlaying.mockReset();
    mockCore.startPlaying.mockResolvedValue(undefined);
    mockCore.stopPlaying.mockReset();
    mockCore.stopPlaying.mockResolvedValue(undefined);
    mockCore.executeCommand.mockReset();
    mockCore.setPlayheadPosition.mockClear();
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
    mockSelectedItems = [];
    mockCopiedItems = [];
    selectionChangedCallbacks.length = 0;
    mockCore.onSelectionChanged.mockClear();
    mockCore.clearSelectedItems.mockClear();
    mockCore.addSelectedItems.mockClear();
    mockIsMetronomeEnabled = false;
    mockShowGlobalTracks = false;
    mockProject.setIsMetronomeEnabled.mockClear();
    mockProject.setShowGlobalTracks.mockClear();
    mockProject.setPlayheadPosition.mockClear();
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
    expect(state.midiReferenceRegionId).toBeNull();
    expect(state.requestedSheetMusicViewEnabled).toBe(false);
    expect(state.pianoRollViewRequestVersion).toBe(1);
  });

  it('opens, replaces, and exits MIDI reference mode while preserving the main region', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().openMidiReferenceMode('midi-main', 'midi-reference-a');
    });

    let state = useProjectStore.getState();
    expect(pianoRollStateMocks.setSheetMusicViewEnabled).toHaveBeenLastCalledWith(false);
    expect(state.showPianoRoll).toBe(true);
    expect(state.pianoRollMode).toBe('midi-reference');
    expect(state.activeRegionId).toBe('midi-main');
    expect(state.midiReferenceRegionId).toBe('midi-reference-a');
    expect(state.hybridAudioRegionId).toBeNull();
    expect(state.requestedSheetMusicViewEnabled).toBe(false);

    act(() => {
      useProjectStore.getState().openMidiReferenceMode('midi-main', 'midi-reference-b');
    });

    state = useProjectStore.getState();
    expect(state.activeRegionId).toBe('midi-main');
    expect(state.midiReferenceRegionId).toBe('midi-reference-b');

    act(() => {
      useProjectStore.getState().exitMidiReferenceMode();
    });

    state = useProjectStore.getState();
    expect(state.showPianoRoll).toBe(true);
    expect(state.activeRegionId).toBe('midi-main');
    expect(state.pianoRollMode).toBe('midi-edit');
    expect(state.midiReferenceRegionId).toBeNull();
  });

  it('clears MIDI reference state when opening an audio viewer', async () => {
    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().openMidiReferenceMode('midi-main', 'midi-reference');
      useProjectStore.getState().openAudioWaveformViewer('audio-a');
    });

    const state = useProjectStore.getState();
    expect(state.pianoRollMode).toBe('audio-waveform');
    expect(state.activeRegionId).toBe('audio-a');
    expect(state.midiReferenceRegionId).toBeNull();
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

  it('refreshes expanded max bars after BPM reduction', async () => {
    const { KGAudioTrack: TestAudioTrack } = await import('../core/track/KGAudioTrack');
    const { KGAudioRegion: TestAudioRegion } = await import('../core/region/KGAudioRegion');

    const audioTrack = new TestAudioTrack('Audio 1', 1);
    audioTrack.setTrackIndex(0);
    const audioRegion = new TestAudioRegion('audio-region-1', '1', 0, 'clip.wav', 124, 4, 'audio-file-1.wav', 'clip.wav', 8, 0);
    audioTrack.setRegions([audioRegion]);

    let projectName = 'Test Project';
    let bpm = 120;
    let maxBars = 32;
    let currentBars = 0;
    let timeSignature = { numerator: 4, denominator: 4 };
    let keySignature = 'C major';
    let selectedMode = 'major';
    const project = {
      getName: () => projectName,
      setName: (value: string) => { projectName = value; },
      getMaxBars: () => maxBars,
      setMaxBars: (value: number) => { maxBars = value; },
      getCurrentBars: () => currentBars,
      setCurrentBars: (value: number) => { currentBars = value; },
      getTimeSignature: () => timeSignature,
      setTimeSignature: (value: { numerator: number; denominator: number }) => { timeSignature = value; },
      getBarWidthMultiplier: () => 1,
      getTracks: () => [audioTrack],
      getGlobalTracks: () => createDefaultGlobalTracks(),
      getBpm: () => bpm,
      setBpm: (value: number) => { bpm = value; },
      getKeySignature: () => keySignature,
      setKeySignature: (value: string) => { keySignature = value; },
      getSelectedMode: () => selectedMode,
      setSelectedMode: (value: string) => { selectedMode = value; },
      getIsLooping: () => false,
      getIsMetronomeEnabled: () => false,
      setIsMetronomeEnabled: vi.fn(),
      getShowGlobalTracks: () => false,
      setShowGlobalTracks: vi.fn(),
      getLoopingRange: () => [0, 0] as [number, number],
      getPianoRollZoom: () => 1,
    };
    currentProject = project as unknown as typeof mockProject;
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setBpm(60);
    });

    const state = useProjectStore.getState();
    expect(bpm).toBe(60);
    expect(maxBars).toBe(33);
    expect(state.maxBars).toBe(33);
    expect(audioRegion.getLength()).toBeCloseTo(8);
    expect(getAudioRegionDisplayLengthBeats(project as any, audioRegion)).toBeCloseTo(8);
  });

  it('does not auto-shrink max bars after BPM increase', async () => {
    const { KGAudioTrack: TestAudioTrack } = await import('../core/track/KGAudioTrack');
    const { KGAudioRegion: TestAudioRegion } = await import('../core/region/KGAudioRegion');

    const audioTrack = new TestAudioTrack('Audio 1', 1);
    audioTrack.setTrackIndex(0);
    audioTrack.setRegions([
      new TestAudioRegion('audio-region-1', '1', 0, 'clip.wav', 124, 8, 'audio-file-1.wav', 'clip.wav', 4, 0),
    ]);

    let projectName = 'Test Project';
    let bpm = 120;
    let maxBars = 40;
    let currentBars = 0;
    let timeSignature = { numerator: 4, denominator: 4 };
    let keySignature = 'C major';
    let selectedMode = 'major';
    const project = {
      getName: () => projectName,
      setName: (value: string) => { projectName = value; },
      getMaxBars: () => maxBars,
      setMaxBars: (value: number) => { maxBars = value; },
      getCurrentBars: () => currentBars,
      setCurrentBars: (value: number) => { currentBars = value; },
      getTimeSignature: () => timeSignature,
      setTimeSignature: (value: { numerator: number; denominator: number }) => { timeSignature = value; },
      getBarWidthMultiplier: () => 1,
      getTracks: () => [audioTrack],
      getGlobalTracks: () => createDefaultGlobalTracks(),
      getBpm: () => bpm,
      setBpm: (value: number) => { bpm = value; },
      getKeySignature: () => keySignature,
      setKeySignature: (value: string) => { keySignature = value; },
      getSelectedMode: () => selectedMode,
      setSelectedMode: (value: string) => { selectedMode = value; },
      getIsLooping: () => false,
      getIsMetronomeEnabled: () => false,
      setIsMetronomeEnabled: vi.fn(),
      getShowGlobalTracks: () => false,
      setShowGlobalTracks: vi.fn(),
      getLoopingRange: () => [0, 0] as [number, number],
      getPianoRollZoom: () => 1,
    };
    currentProject = project as unknown as typeof mockProject;
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setBpm(180);
    });

    const state = useProjectStore.getState();
    expect(bpm).toBe(180);
    expect(maxBars).toBe(40);
    expect(state.maxBars).toBe(40);
    expect((audioTrack.getRegions()[0] as KGAudioRegion).getLength()).toBeCloseTo(12);
  });

  it('moves the playhead to the song end when max bars shrink past it', async () => {
    const { KGProject } = await import('../core/KGProject');
    mockPlayheadPosition = 124;

    currentProject = new KGProject('Test Project', 32, 0, 120) as unknown as typeof mockProject;
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setMaxBars(16);
    });

    const state = useProjectStore.getState();
    expect(currentProject.getMaxBars()).toBe(16);
    expect(mockPlayheadPosition).toBe(64);
    expect(mockCore.setPlayheadPosition).toHaveBeenCalledWith(64);
    expect(state.maxBars).toBe(16);
    expect(state.playheadPosition).toBe(64);
  });

  it('inserts a new MIDI track below the selected track', async () => {
    const { KGProject } = await import('../core/KGProject');
    const firstTrack = new KGMidiTrack('Lead', 1, 'trumpet');
    firstTrack.setTrackIndex(0);
    const secondTrack = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    secondTrack.setTrackIndex(1);
    const thirdTrack = new KGMidiTrack('Drums', 3, 'synth_drum');
    thirdTrack.setTrackIndex(2);

    const project = new KGProject('Track Insert Project');
    project.setTracks([firstTrack, secondTrack, thirdTrack]);
    currentProject = project as unknown as typeof mockProject;
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().setSelectedTrack('2');
    });

    await act(async () => {
      await useProjectStore.getState().addTrack();
    });

    const trackNames = currentProject.getTracks().map(track => track.getName());
    const trackIndices = currentProject.getTracks().map(track => track.getTrackIndex());
    const insertedTrack = currentProject.getTracks()[2];

    expect(trackNames).toEqual(['Lead', 'Bass', 'Track 1', 'Drums']);
    expect(trackIndices).toEqual([0, 1, 2, 3]);
    expect(useProjectStore.getState().selectedTrackId).toBe(insertedTrack.getId().toString());
    expect(useProjectStore.getState().showInstrumentSelection).toBe(true);
  });

  it('selects only the newly pasted notes after pasting into the active MIDI region', async () => {
    const { KGMidiTrack: TestMidiTrack } = await import('../core/track/KGMidiTrack');
    const { KGMidiRegion: TestMidiRegion } = await import('../core/region/KGMidiRegion');
    const { KGMidiNote: TestMidiNote } = await import('../core/midi/KGMidiNote');
    const track = new TestMidiTrack('Track 1', 1, 'acoustic_grand_piano');
    track.setTrackIndex(0);
    const region = new TestMidiRegion('region-1', '1', 0, 'Region 1', 4, 16);
    const existingSelectedNote = new TestMidiNote('existing-note', 0, 1, 60, 100);
    existingSelectedNote.select();
    region.addNote(existingSelectedNote);
    track.setRegions([region]);

    mockTracks = [track];
    currentProject = {
      ...mockProject,
      getTracks: () => mockTracks,
    } as typeof mockProject;

    mockSelectedItems = [existingSelectedNote];
    mockCopiedItems = [
      new TestMidiNote('copied-a', 2, 3, 64, 110),
      new TestMidiNote('copied-b', 3, 5, 67, 120),
    ];
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().pasteNotesToActiveRegion(region.getId(), 10);
    });

    const pastedNotes = region.getNotes().filter(note => note.getId() !== existingSelectedNote.getId());
    const pastedNoteIds = pastedNotes.map(note => note.getId());
    const state = useProjectStore.getState();

    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
    expect(existingSelectedNote.isSelected()).toBe(false);
    expect(pastedNotes).toHaveLength(2);
    expect(pastedNotes.every(note => note.isSelected())).toBe(true);
    expect(mockCore.clearSelectedItems).toHaveBeenCalledTimes(1);
    expect(mockCore.addSelectedItems).toHaveBeenCalledWith(pastedNotes);
    expect(state.selectedNoteIds).toEqual(pastedNoteIds);
    expect(mockProject.setPlayheadPosition).toHaveBeenCalledWith(13);
    expect(mockCore.setPlayheadPosition).toHaveBeenCalledWith(13);
    expect(state.playheadPosition).toBe(13);
  });

  it('keeps selection unchanged when note paste has no clipboard notes', async () => {
    const { KGMidiTrack: TestMidiTrack } = await import('../core/track/KGMidiTrack');
    const { KGMidiRegion: TestMidiRegion } = await import('../core/region/KGMidiRegion');
    const { KGMidiNote: TestMidiNote } = await import('../core/midi/KGMidiNote');
    const track = new TestMidiTrack('Track 1', 1, 'acoustic_grand_piano');
    track.setTrackIndex(0);
    const region = new TestMidiRegion('region-1', '1', 0, 'Region 1', 0, 16);
    const existingSelectedNote = new TestMidiNote('existing-note', 0, 1, 60, 100);
    existingSelectedNote.select();
    region.addNote(existingSelectedNote);
    track.setRegions([region]);

    mockTracks = [track];
    currentProject = {
      ...mockProject,
      getTracks: () => mockTracks,
    } as typeof mockProject;

    mockSelectedItems = [existingSelectedNote];
    mockCopiedItems = [];

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().pasteNotesToActiveRegion(region.getId(), 8);
    });

    expect(mockCore.executeCommand).not.toHaveBeenCalled();
    expect(mockCore.clearSelectedItems).not.toHaveBeenCalled();
    expect(mockCore.addSelectedItems).not.toHaveBeenCalled();
    expect(existingSelectedNote.isSelected()).toBe(true);
  });

  it('moves the playhead to the end of the pasted regions', async () => {
    const { KGMidiTrack: TestMidiTrack } = await import('../core/track/KGMidiTrack');
    const { KGMidiRegion: TestMidiRegion } = await import('../core/region/KGMidiRegion');
    const track = new TestMidiTrack('Track 1', 1, 'acoustic_grand_piano');
    track.setTrackIndex(0);

    mockTracks = [track];
    currentProject = {
      ...mockProject,
      getTracks: () => mockTracks,
    } as typeof mockProject;

    mockCopiedItems = [
      new TestMidiRegion('copied-region-a', 'source-track', 0, 'Region A', 2, 4),
      new TestMidiRegion('copied-region-b', 'source-track', 0, 'Region B', 5, 6),
    ];
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());

    const { useProjectStore } = await import('./projectStore');

    act(() => {
      useProjectStore.getState().pasteRegionsAtTrack(track.getId().toString(), 10);
    });

    const pastedRegions = track.getRegions();
    const state = useProjectStore.getState();

    expect(mockCore.executeCommand).toHaveBeenCalledTimes(1);
    expect(pastedRegions).toHaveLength(2);
    expect(mockProject.setPlayheadPosition).toHaveBeenCalledWith(19);
    expect(mockCore.setPlayheadPosition).toHaveBeenCalledWith(19);
    expect(state.playheadPosition).toBe(19);
  });

  it('pastes multi-track regions to their original tracks and advances to the latest end', async () => {
    const { KGMidiTrack: TestMidiTrack } = await import('../core/track/KGMidiTrack');
    const { KGMidiRegion: TestMidiRegion } = await import('../core/region/KGMidiRegion');
    const firstTrack = new TestMidiTrack('Track 1', 1, 'acoustic_grand_piano');
    const secondTrack = new TestMidiTrack('Track 2', 2, 'acoustic_grand_piano');
    firstTrack.setTrackIndex(0);
    secondTrack.setTrackIndex(1);
    mockTracks = [firstTrack, secondTrack];
    let maxBars = 4;
    currentProject = {
      ...mockProject,
      getTracks: () => mockTracks,
      getMaxBars: () => maxBars,
      setMaxBars: (value: number) => { maxBars = value; },
    } as typeof mockProject;
    mockCopiedItems = [
      new TestMidiRegion('copied-region-a', '1', 0, 'Region A', 2, 4),
      new TestMidiRegion('copied-region-b', '2', 1, 'Region B', 5, 6),
    ];
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());
    const { useProjectStore } = await import('./projectStore');

    let result = { success: false };
    act(() => {
      result = useProjectStore.getState().pasteRegionsAtTrack(null, 10);
    });

    expect(result).toEqual({ success: true });
    expect(firstTrack.getRegions().map(region => region.getStartFromBeat())).toEqual([10]);
    expect(secondTrack.getRegions().map(region => region.getStartFromBeat())).toEqual([13]);
    expect(mockProject.setPlayheadPosition).toHaveBeenCalledWith(19);
    expect(useProjectStore.getState().playheadPosition).toBe(19);
    expect(maxBars).toBe(5);
    expect(useProjectStore.getState().maxBars).toBe(5);
    expect(document.documentElement.style.getPropertyValue('--max-number-of-bars')).toBe('5');
  });

  it('returns a friendly error without moving the playhead when an original track is missing', async () => {
    const { KGMidiTrack: TestMidiTrack } = await import('../core/track/KGMidiTrack');
    const { KGMidiRegion: TestMidiRegion } = await import('../core/region/KGMidiRegion');
    const availableTrack = new TestMidiTrack('Track 1', 1, 'acoustic_grand_piano');
    availableTrack.setTrackIndex(0);
    mockTracks = [availableTrack];
    currentProject = {
      ...mockProject,
      getTracks: () => mockTracks,
    } as typeof mockProject;
    mockCopiedItems = [
      new TestMidiRegion('copied-region-a', '1', 0, 'Region A', 2, 4),
      new TestMidiRegion('copied-region-b', '2', 1, 'Region B', 5, 6),
    ];
    mockCore.executeCommand.mockImplementation((command: { execute: () => void }) => command.execute());
    const { useProjectStore } = await import('./projectStore');

    let result: { success: boolean; error?: string } = { success: true };
    act(() => {
      result = useProjectStore.getState().pasteRegionsAtTrack(null, 10);
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Some of the original tracks are no longer available');
    expect(availableTrack.getRegions()).toHaveLength(0);
    expect(mockProject.setPlayheadPosition).not.toHaveBeenCalled();
    expect(useProjectStore.getState().playheadPosition).toBe(0);
  });
});
