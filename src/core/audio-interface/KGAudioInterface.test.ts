import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockMidiNote, createMockMidiPitchBend, createMockMidiRegion, createMockMidiTrack, createMockProject } from '../../test/utils/mock-data';
import { MockTransport } from '../../test/mocks/tone';
import { GlobalTrackType } from '../global-track';
import { KGTempoRegion } from '../region/KGTempoRegion';

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
import { KGAudioTrack } from '../track/KGAudioTrack';
import { KGAudioRegion } from '../region/KGAudioRegion';

function createMockAudioBus() {
  return {
    resetLiveMidiPitchBend: vi.fn(),
    setLiveMidiPitchBend: vi.fn(),
    scheduleLiveMidiPitchBend: vi.fn(),
    setLiveMidiExpression: vi.fn(),
    scheduleLiveMidiExpression: vi.fn(),
    setLiveMidiSustain: vi.fn(),
    setAutomationVolume: vi.fn(),
    setAutomationPan: vi.fn(),
    scheduleAutomationPan: vi.fn(),
    applyEffectiveVolume: vi.fn(),
    getSolo: vi.fn().mockReturnValue(false),
    shouldPlayWithSolo: vi.fn().mockReturnValue(true),
  };
}

function createMockPlayerBus(solo = false) {
  return {
    setAutomationVolume: vi.fn(),
    setAutomationPan: vi.fn(),
    scheduleAutomationPan: vi.fn(),
    applyEffectiveVolume: vi.fn(),
    getSolo: vi.fn().mockReturnValue(solo),
    setMuted: vi.fn(),
    setSolo: vi.fn(),
    hasBuffer: vi.fn().mockReturnValue(true),
    schedulePlayback: vi.fn(),
    // Audio-region sources used to be guarded by this method. Keep it false
    // in the regression tests to prove the callback still starts the source.
    shouldPlayWithSolo: vi.fn().mockReturnValue(false),
  };
}

function setTempoRegions(project: ReturnType<typeof createMockProject>, regions: KGTempoRegion[]): void {
  const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo);
  if (!tempoTrack) {
    throw new Error('Tempo track missing in test setup');
  }

  tempoTrack.setRegions(regions);
}

function transportTimeToBeats(time: unknown): number {
  if (typeof time === 'string' && time.endsWith('i')) {
    return Number.parseFloat(time.slice(0, -1)) / MockTransport.PPQ;
  }
  return Number(time);
}

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
    ;(MockTransport as typeof MockTransport & { seconds?: number }).seconds = 0;

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

    expect(MockTransport.position).toBe(0);
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
    const audioBus = createMockAudioBus();

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 0);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => transportTimeToBeats(time));
    expect(scheduledTimes).toContain(0.5);
    expect(scheduledTimes).toContain(1);
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
    const audioBus = createMockAudioBus();

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 0);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => transportTimeToBeats(time));
    expect(scheduledTimes).toEqual([0.5]);
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
    const audioBus = createMockAudioBus();

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
    const audioBus = createMockAudioBus();

    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);
    audio.preparePlayback(project, 5);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => transportTimeToBeats(time));
    expect(scheduledTimes).toContain(0);
  });

  it('schedules post-tempo-change notes using playback-local transport time', () => {
    const notes = [
      createMockMidiNote({ id: 'note-1', startBeat: 4, endBeat: 5 }),
      createMockMidiNote({ id: 'note-2', startBeat: 5, endBeat: 6 }),
    ];
    const region = createMockMidiRegion({ notes, length: 8 });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ bpm: 120, tracks: [track] });
    setTempoRegions(project, [
      new KGTempoRegion('tempo-a', 'tempo-track', 0, 120, 0, 1, 4),
      new KGTempoRegion('tempo-b', 'tempo-track', 0, 60, 1, 31, 4),
    ]);

    const audio = KGAudioInterface.instance();
    const audioBus = createMockAudioBus();
    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);

    audio.preparePlayback(project, 0);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => transportTimeToBeats(time));
    expect(scheduledTimes.filter(time => time === 4)).toHaveLength(2);
    expect(scheduledTimes).toContain(5);
  });

  it('keeps post-tempo-change note spacing correct for nonzero playback starts', () => {
    const notes = [
      createMockMidiNote({ id: 'note-1', startBeat: 4, endBeat: 5 }),
      createMockMidiNote({ id: 'note-2', startBeat: 5, endBeat: 6 }),
    ];
    const region = createMockMidiRegion({ notes, length: 8 });
    const track = createMockMidiTrack({ id: 1, regions: [region] });
    const project = createMockProject({ bpm: 120, tracks: [track] });
    setTempoRegions(project, [
      new KGTempoRegion('tempo-a', 'tempo-track', 0, 120, 0, 1, 4),
      new KGTempoRegion('tempo-b', 'tempo-track', 0, 60, 1, 31, 4),
    ]);

    const audio = KGAudioInterface.instance();
    const audioBus = createMockAudioBus();
    ;(audio as unknown as { trackAudioBuses: Map<string, unknown> }).trackAudioBuses.set('1', audioBus);

    audio.preparePlayback(project, 2);

    const scheduledTimes = MockTransport.schedule.mock.calls.map(([, time]) => transportTimeToBeats(time));
    expect(scheduledTimes.filter(time => time === 2)).toHaveLength(2);
    expect(scheduledTimes).toContain(3);
  });

  it('maps transport seconds back to project beats across a tempo change', () => {
    const project = createMockProject({ bpm: 120, tracks: [] });
    setTempoRegions(project, [
      new KGTempoRegion('tempo-a', 'tempo-track', 0, 120, 0, 1, 4),
      new KGTempoRegion('tempo-b', 'tempo-track', 0, 60, 1, 31, 4),
    ]);

    vi.mocked(KGCore.instance).mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const audio = KGAudioInterface.instance();
    audio.preparePlayback(project, 2);
    ;(MockTransport as typeof MockTransport & { seconds?: number }).seconds = 2;

    expect(audio.getTransportPosition()).toBeCloseTo(5, 5);
  });
});

describe('KGAudioInterface audio-track mute and solo playback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockTransport.position = 0;
    MockTransport.schedule.mockClear();
    MockTransport.bpm.value = 120;

    vi.mocked(ConfigManager.instance).mockReturnValue({
      get: (key: string) => {
        if (key === 'audio.playback_delay') return 0.2;
        if (key === 'audio.midi_automation_interpolation_interval_ms') return 250;
        return null;
      },
    } as unknown as ConfigManager);

    ;(KGAudioInterface as unknown as { _instance: KGAudioInterface | null })._instance = null;
  });

  function createAudioProject(muted = false) {
    const track = new KGAudioTrack('Audio', 1);
    track.setMuted(muted);
    track.setRegions([
      new KGAudioRegion('audio-region', '1', 0, 'Clip', 1, 4, 'audio-file', 'clip.wav', 4),
    ]);
    const project = createMockProject();
    project.setTracks([track]);
    return project;
  }

  function invokeScheduledCallbackAtBeat(beat: number): void {
    const scheduledCall = MockTransport.schedule.mock.calls.find(([, time]) => transportTimeToBeats(time) === beat);
    if (!scheduledCall) {
      throw new Error(`No scheduled callback found at beat ${beat}`);
    }
    (scheduledCall[0] as (time: number) => void)(1);
  }

  it('starts a muted audio-region source so unmuting restores its gain without restarting transport', () => {
    const project = createAudioProject(true);
    vi.mocked(KGCore.instance).mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);
    const audio = KGAudioInterface.instance();
    const playerBus = createMockPlayerBus();
    ;(audio as unknown as { trackAudioPlayerBuses: Map<string, unknown> }).trackAudioPlayerBuses.set('1', playerBus);

    audio.preparePlayback(project, 0);
    invokeScheduledCallbackAtBeat(1);

    expect(playerBus.schedulePlayback).toHaveBeenCalledWith(1.2, 'audio-file', 0, 2);

    audio.setTrackMute('1', false);
    expect(playerBus.setMuted).toHaveBeenCalledWith(false);
    expect(playerBus.applyEffectiveVolume).toHaveBeenLastCalledWith(false);
  });

  it('starts a muted source when playback resumes inside an audio region', () => {
    const project = createAudioProject(true);
    const audio = KGAudioInterface.instance();
    const playerBus = createMockPlayerBus();
    ;(audio as unknown as { trackAudioPlayerBuses: Map<string, unknown> }).trackAudioPlayerBuses.set('1', playerBus);

    audio.preparePlayback(project, 2);
    const scheduledCallback = MockTransport.schedule.mock.calls[0]?.[0] as ((time: number) => void) | undefined;
    scheduledCallback?.(1);

    expect(playerBus.schedulePlayback).toHaveBeenCalledTimes(1);
  });

  it('starts an audio-region source when another track solos it out', () => {
    const project = createAudioProject();
    const audio = KGAudioInterface.instance();
    const excludedPlayerBus = createMockPlayerBus(false);
    const soloedPlayerBus = createMockPlayerBus(true);
    ;(audio as unknown as { trackAudioPlayerBuses: Map<string, unknown> }).trackAudioPlayerBuses.set('1', excludedPlayerBus);
    ;(audio as unknown as { trackAudioPlayerBuses: Map<string, unknown> }).trackAudioPlayerBuses.set('2', soloedPlayerBus);

    audio.preparePlayback(project, 0);
    invokeScheduledCallbackAtBeat(1);

    expect(excludedPlayerBus.schedulePlayback).toHaveBeenCalledWith(1.2, 'audio-file', 0, 2);
    expect(excludedPlayerBus.shouldPlayWithSolo).not.toHaveBeenCalled();
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
