import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMidiPitchBend, createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../test/utils/mock-data';
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
import { MIDI_PITCH_BEND_CENTER, midiPitchBendToNormalized } from '../../util/midiUtil';

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
        if (key === 'audio.midi_automation_interpolation_interval_ms') return 250;
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

  it('schedules baked pitch bend points instead of authored step changes only', () => {
    const region = createMockMidiRegion({
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0, value: MIDI_PITCH_BEND_CENTER }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 1, value: 0 }),
      ],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ tracks: [track] });
    const audio = KGAudioInterface.instance();
    const audioBus = {
      resetLiveMidiPitchBend: vi.fn(),
      setLiveMidiPitchBend: vi.fn(),
      scheduleLiveMidiPitchBend: vi.fn(),
      setLiveMidiExpression: vi.fn(),
      setLiveMidiSustain: vi.fn(),
      shouldPlayWithSolo: vi.fn().mockReturnValue(true),
    };

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 0);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => time);
    expect(scheduledTimes).toContain(0.25);
    expect(scheduledTimes).toContain(0.5);
  });

  it('skips redundant scheduled pitch bend events when interpolated values round to the same MIDI value', () => {
    const region = createMockMidiRegion({
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0, value: MIDI_PITCH_BEND_CENTER }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 1, value: MIDI_PITCH_BEND_CENTER + 1 }),
      ],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ tracks: [track] });
    const audio = KGAudioInterface.instance();
    const audioBus = {
      resetLiveMidiPitchBend: vi.fn(),
      setLiveMidiPitchBend: vi.fn(),
      scheduleLiveMidiPitchBend: vi.fn(),
      setLiveMidiExpression: vi.fn(),
      setLiveMidiSustain: vi.fn(),
      shouldPlayWithSolo: vi.fn().mockReturnValue(true),
    };

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 0);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => time);
    expect(scheduledTimes).toEqual([0.25]);
  });

  it('computes the initial interpolated bend for non-zero playback starts', () => {
    const region = createMockMidiRegion({
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0, value: MIDI_PITCH_BEND_CENTER }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 4, value: 0 }),
      ],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ tracks: [track] });
    const audio = KGAudioInterface.instance();
    const audioBus = {
      resetLiveMidiPitchBend: vi.fn(),
      setLiveMidiPitchBend: vi.fn(),
      scheduleLiveMidiPitchBend: vi.fn(),
      setLiveMidiExpression: vi.fn(),
      setLiveMidiSustain: vi.fn(),
      shouldPlayWithSolo: vi.fn().mockReturnValue(true),
    };

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 2);

    expect(audioBus.setLiveMidiPitchBend).toHaveBeenCalledWith(midiPitchBendToNormalized(4096));
  });

  it('adds a loop-start re-anchor for interpolated pitch bend state', () => {
    const region = createMockMidiRegion({
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 2, value: 0 }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 6, value: MIDI_PITCH_BEND_CENTER }),
      ],
    });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ tracks: [track] });
    project.setIsLooping(true);
    project.setLoopingRange([1, 1]);

    const audio = KGAudioInterface.instance();
    const audioBus = {
      resetLiveMidiPitchBend: vi.fn(),
      setLiveMidiPitchBend: vi.fn(),
      scheduleLiveMidiPitchBend: vi.fn(),
      setLiveMidiExpression: vi.fn(),
      setLiveMidiSustain: vi.fn(),
      shouldPlayWithSolo: vi.fn().mockReturnValue(true),
    };

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 5);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => time);
    expect(scheduledTimes).toContain(2);
  });
});

describe('KGAudioInterface live MIDI CC forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ;(KGAudioInterface as unknown as { _instance: KGAudioInterface | null })._instance = null;
  });

  it('forwards live expression and sustain to the target audio bus', () => {
    const audio = KGAudioInterface.instance();
    const audioBus = {
      setLiveMidiExpression: vi.fn(),
      setLiveMidiSustain: vi.fn(),
    };

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);

    audio.setLiveMidiExpression('1', 0.5);
    audio.setLiveMidiSustain('1', true, 2);

    expect(audioBus.setLiveMidiExpression).toHaveBeenCalledWith(0.5);
    expect(audioBus.setLiveMidiSustain).toHaveBeenCalledWith(true, 2);
  });

  it('safely ignores live expression and sustain when the bus is missing', () => {
    const audio = KGAudioInterface.instance();

    expect(() => audio.setLiveMidiExpression('missing', 0.5)).not.toThrow();
    expect(() => audio.setLiveMidiSustain('missing', true)).not.toThrow();
  });
});
