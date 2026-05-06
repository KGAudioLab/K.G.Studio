import { vi } from 'vitest';

/**
 * Mock implementation of Tone.js for testing
 * This provides consistent, deterministic behavior for audio-related tests
 */

// Mock Sampler class
export const MockSampler = vi.fn().mockImplementation(() => ({
  triggerAttackRelease: vi.fn(),
  triggerAttack: vi.fn(),
  triggerRelease: vi.fn(),
  dispose: vi.fn(),
  loaded: true,
  attack: 0,
  release: 0.1,
  curve: 'exponential',
  output: {},
  volume: {
    value: -12
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  toDestination: vi.fn()
}));

export const MockBufferSource = vi.fn().mockImplementation((options?: { playbackRate?: number }) => {
  const instance = {
    playbackRate: {
      value: options?.playbackRate ?? 1,
    },
    connect: vi.fn(() => instance),
    start: vi.fn(() => instance),
    stop: vi.fn(() => instance),
    onended: undefined as (() => void) | undefined,
  };
  return instance;
});

// Mock Transport object
export const MockTransport = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  position: 0,
  bpm: {
    value: 120,
    rampTo: vi.fn()
  },
  timeSignature: [4, 4],
  state: 'stopped',
  scheduleOnce: vi.fn(),
  scheduleRepeat: vi.fn(),
  schedule: vi.fn().mockReturnValue(1),
  cancel: vi.fn(),
  clear: vi.fn()
  ,
  setLoopPoints: vi.fn(),
  loop: false,
  PPQ: 192,
  getTicksAtTime: vi.fn().mockImplementation((time: number) => time * 192)
};

export const MockLoop = vi.fn().mockImplementation((callback: (time: number) => void, interval: string) => ({
  callback,
  interval,
  start: vi.fn(),
  dispose: vi.fn()
}));

// Mock Destination
export const MockDestination = {
  volume: {
    value: -12
  },
  mute: false,
  connect: vi.fn(),
  disconnect: vi.fn()
};

// Mock ToneAudioBuffer
export const MockToneAudioBuffer = vi.fn().mockImplementation(() => ({
  loaded: true,
  dispose: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined)
}));

// Mock Gain node
export const MockGain = vi.fn().mockImplementation(() => ({
  gain: {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}));

// Mock Meter
export const MockMeter = vi.fn().mockImplementation(() => ({
  getValue: vi.fn().mockReturnValue(-Infinity),
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}));

// Complete Tone.js mock
export const ToneMock = {
  Sampler: MockSampler,
  BufferSource: MockBufferSource,
  ToneBufferSource: MockBufferSource,
  Loop: MockLoop,
  Transport: MockTransport,
  Destination: MockDestination,
  ToneAudioBuffer: MockToneAudioBuffer,
  Gain: MockGain,
  Meter: MockMeter,
  
  // Context management
  start: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn().mockReturnValue({
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    lookAhead: 0.05,
    setTimeout: vi.fn().mockImplementation((fn: () => void, timeoutSeconds: number) => {
      return window.setTimeout(fn, timeoutSeconds * 1000);
    }),
    clearTimeout: vi.fn().mockImplementation((id: number) => {
      window.clearTimeout(id);
    })
  }),
  
  // Time utilities
  Time: vi.fn().mockImplementation((time) => ({
    toSeconds: vi.fn().mockReturnValue(parseFloat(time) || 0),
    valueOf: vi.fn().mockReturnValue(parseFloat(time) || 0)
  })),
  
  // Frequency utilities
  Frequency: vi.fn().mockImplementation((freq) => ({
    toFrequency: vi.fn().mockReturnValue(parseFloat(freq) || 440),
    valueOf: vi.fn().mockReturnValue(parseFloat(freq) || 440)
  })),
  now: vi.fn().mockImplementation(() => Date.now() / 1000)
};

// Setup the global mock
export const setupToneMocks = () => {
  vi.doMock('tone', () => ToneMock);
};
