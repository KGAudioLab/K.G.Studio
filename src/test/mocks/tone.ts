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
  releaseAll: vi.fn(),
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
      setValueAtTime: vi.fn(),
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
  PPQ: 960,
  getTicksAtTime: vi.fn().mockImplementation((time: number) => time * 960)
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
export const MockGain = vi.fn().mockImplementation((initialValue: number | { gain?: number } = 1) => ({
  context: { sampleRate: 48000, isOffline: true, now: () => 0,
    setTimeout: (fn: () => void, seconds: number) => window.setTimeout(fn, seconds * 1000),
    clearTimeout: (id: number) => window.clearTimeout(id) },
  gain: {
    context: { now: () => 0 },
    cancelAndHoldAtTime: vi.fn(),
    value: typeof initialValue === 'number' ? initialValue : initialValue.gain ?? 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    rampTo: vi.fn()
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}));

export const MockBiquadFilter = vi.fn().mockImplementation((options: { type: string }) => {
  const param = () => ({ value: 0, context: { now: () => 0 }, cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), rampTo: vi.fn() });
  return { type: options.type, frequency: param(), Q: param(), gain: param(),
    connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() };
});

export const MockLimiter = vi.fn().mockImplementation(() => ({
  threshold: { value: -12, context: { now: () => 0 }, cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), rampTo: vi.fn() },
  connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(),
}));

export const MockCompressor = vi.fn().mockImplementation(() => {
  const param = () => ({ value: 0, context: { now: () => 0 }, cancelAndHoldAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  return { threshold: param(), ratio: param(), attack: param(), release: param(), knee: param(),
    connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() };
});

export const MockConvolver = vi.fn().mockImplementation((options: { url?: AudioBuffer }) => ({
  buffer: options.url, connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn(),
}));

// Mock Panner node
export const MockPanner = vi.fn().mockImplementation((initialValue: number = 0) => ({
  pan: {
    value: initialValue,
    setValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn(),
  toDestination: vi.fn(),
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
  BiquadFilter: MockBiquadFilter,
  Limiter: MockLimiter,
  Compressor: MockCompressor,
  Convolver: MockConvolver,
  Panner: MockPanner,
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
