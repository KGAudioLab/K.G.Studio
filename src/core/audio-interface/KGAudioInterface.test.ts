import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProject } from '../../test/utils/mock-data';
import { MockTransport } from '../../test/mocks/tone';

vi.mock('tone', async () => {
  const { ToneMock } = await import('../../test/mocks/tone');
  return ToneMock;
});

vi.mock('../KGCore', () => ({
  KGCore: {
    instance: vi.fn()
  }
}));

vi.mock('../config/ConfigManager', () => ({
  ConfigManager: {
    instance: vi.fn()
  }
}));

import { KGCore } from '../KGCore';
import { ConfigManager } from '../config/ConfigManager';
import { KGAudioInterface } from './KGAudioInterface';

describe('KGAudioInterface preroll playback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.clearAllMocks();

    MockTransport.position = 0;
    MockTransport.start.mockClear();
    MockTransport.stop.mockClear();
    MockTransport.clear.mockClear();
    MockTransport.schedule.mockClear();
    MockTransport.bpm.value = 120;

    const project = createMockProject({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [],
    });

    vi.mocked(KGCore.instance).mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    vi.mocked(ConfigManager.instance).mockReturnValue({
      get: (key: string) => {
        if (key === 'audio.playback_delay') return 0.2;
        if (key === 'audio.lookahead_time') return 0.05;
        return null;
      },
    } as unknown as ConfigManager)

    ;(KGAudioInterface as unknown as { _instance: KGAudioInterface | null })._instance = null;
  });

  it('uses virtual negative beats until the delayed transport start reaches beat 0', () => {
    const project = KGCore.instance().getCurrentProject();
    const audio = KGAudioInterface.instance()
    ;(audio as unknown as { isInitialized: boolean }).isInitialized = true
    ;(audio as unknown as { isAudioContextStarted: boolean }).isAudioContextStarted = true;

    const metronomeStart = vi.spyOn((audio as unknown as { metronome: { start: (...args: unknown[]) => void } }).metronome, 'start');
    audio.setMetronomeEnabled(true);

    audio.preparePlayback(project, -2);
    audio.startPlayback();

    expect(MockTransport.position).toBe(0);
    expect(MockTransport.start).not.toHaveBeenCalled();
    expect(metronomeStart).toHaveBeenCalledWith(-2, 4, 0.2);
    expect(audio.getTransportPosition()).toBeCloseTo(-2, 2);

    vi.advanceTimersByTime(500);
    expect(audio.getTransportPosition()).toBeCloseTo(-1, 1);

    vi.advanceTimersByTime(500);
    expect(MockTransport.start).toHaveBeenCalledTimes(1);
    expect(audio.getTransportPosition()).toBe(0);
  });

  it('cancels the delayed transport start when playback stops during preroll', () => {
    const project = KGCore.instance().getCurrentProject();
    const audio = KGAudioInterface.instance()
    ;(audio as unknown as { isInitialized: boolean }).isInitialized = true
    ;(audio as unknown as { isAudioContextStarted: boolean }).isAudioContextStarted = true;

    audio.preparePlayback(project, -2);
    audio.startPlayback();
    audio.stopPlayback();
    vi.runAllTimers();

    expect(MockTransport.start).not.toHaveBeenCalled();
    expect(MockTransport.stop).toHaveBeenCalledTimes(1);
    expect(audio.getTransportPosition()).toBe(0);
  });

  it('allows a first-pass start before the loop start when explicitly requested', () => {
    const project = createMockProject({
      bpm: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [],
    });
    project.setIsLooping(true);
    project.setLoopingRange([4, 7]);

    const audio = KGAudioInterface.instance();
    audio.preparePlayback(project, 12, { allowStartBeforeLoopStart: true });

    expect(MockTransport.position).toBe(6);
  });
});
