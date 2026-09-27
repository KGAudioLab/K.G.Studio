import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGProject } from './KGProject';

const audioMocks = vi.hoisted(() => ({
  getIsInitialized: vi.fn(() => true),
  setBpm: vi.fn(),
  startAudioContext: vi.fn().mockResolvedValue(undefined),
  preparePlayback: vi.fn(),
  setTransportPosition: vi.fn(),
  startPlayback: vi.fn(),
  stopPlayback: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('./audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => audioMocks,
  },
}));

vi.mock('./config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      get: (key: string) => key === 'editor.playhead_update_frequency' ? 30 : null,
    }),
  },
}));

vi.mock('./commands', () => ({
  KGCommandHistory: {
    instance: () => ({
      executeCommand: vi.fn(),
      canUndo: vi.fn(() => false),
      canRedo: vi.fn(() => false),
      getUndoDescription: vi.fn(() => ''),
      getRedoDescription: vi.fn(() => ''),
      undo: vi.fn(),
      redo: vi.fn(),
    }),
  },
}));

vi.unmock('./KGCore');

import { KGCore } from './KGCore';

describe('KGCore playback seeking', () => {
  const core = KGCore.instance();

  beforeEach(async () => {
    vi.useFakeTimers();
    if (core.getIsPlaying()) {
      await core.stopPlaying();
    }
    vi.clearAllMocks();
    audioMocks.getIsInitialized.mockReturnValue(true);
    audioMocks.startAudioContext.mockResolvedValue(undefined);
    const project = new KGProject('Seek Test', 16, 0, 120, { numerator: 4, denominator: 4 });
    core.setCurrentProject(project);
    core.setPlayheadPosition(4);
    await core.play();
    vi.clearAllMocks();
  });

  it('stops, reschedules, and resumes from the requested beat without publishing a stopped state', async () => {
    const playbackStates: boolean[] = [];
    core.setPlaybackStateChangeCallback(isPlaying => playbackStates.push(isPlaying));

    await expect(core.seekDuringPlayback(12)).resolves.toBe(true);

    expect(audioMocks.stopPlayback).toHaveBeenCalledTimes(1);
    expect(audioMocks.preparePlayback).toHaveBeenCalledWith(
      core.getCurrentProject(),
      12,
      { allowStartBeforeLoopStart: false, scheduleFullLoop: false }
    );
    expect(audioMocks.setTransportPosition).toHaveBeenCalledWith(12);
    expect(audioMocks.startPlayback).toHaveBeenCalledTimes(1);
    expect(core.getPlayheadPosition()).toBe(12);
    expect(core.getIsPlaying()).toBe(true);
    expect(playbackStates).not.toContain(false);
  });

  it('rejects active-loop seeks outside the half-open loop range', async () => {
    const project = core.getCurrentProject();
    project.setIsLooping(true);
    project.setLoopingRange([2, 3]);

    await expect(core.seekDuringPlayback(7)).resolves.toBe(false);
    await expect(core.seekDuringPlayback(16)).resolves.toBe(false);

    expect(audioMocks.stopPlayback).not.toHaveBeenCalled();
    expect(audioMocks.preparePlayback).not.toHaveBeenCalled();
    expect(core.getPlayheadPosition()).toBe(4);
  });

  it('leaves playback stopped at the target when rescheduling fails', async () => {
    audioMocks.preparePlayback.mockImplementationOnce(() => {
      throw new Error('schedule failed');
    });
    const playbackStates: boolean[] = [];
    core.setPlaybackStateChangeCallback(isPlaying => playbackStates.push(isPlaying));

    await expect(core.seekDuringPlayback(10)).rejects.toThrow('schedule failed');

    expect(core.getPlayheadPosition()).toBe(10);
    expect(core.getIsPlaying()).toBe(false);
    expect(playbackStates).toEqual([false]);
    expect(audioMocks.startPlayback).not.toHaveBeenCalled();
  });
});
