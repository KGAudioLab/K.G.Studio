import { vi } from 'vitest'

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
  volume: {
    value: -12
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  toDestination: vi.fn()
}))

// Mock Transport object
export const MockTransport = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  position: '0:0:0',
  bpm: {
    value: 120,
    rampTo: vi.fn()
  },
  timeSignature: [4, 4],
  state: 'stopped',
  scheduleOnce: vi.fn(),
  scheduleRepeat: vi.fn(),
  cancel: vi.fn(),
  clear: vi.fn()
}

// Mock Destination
export const MockDestination = {
  volume: {
    value: -12
  },
  mute: false,
  connect: vi.fn(),
  disconnect: vi.fn()
}

// Mock ToneAudioBuffer
export const MockToneAudioBuffer = vi.fn().mockImplementation(() => ({
  loaded: true,
  dispose: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined)
}))

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
}))

// Mock Meter
export const MockMeter = vi.fn().mockImplementation(() => ({
  getValue: vi.fn().mockReturnValue(-Infinity),
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}))

// Complete Tone.js mock
export const ToneMock = {
  Sampler: MockSampler,
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
    close: vi.fn().mockResolvedValue(undefined)
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
  }))
}

// Setup the global mock
export const setupToneMocks = () => {
  vi.doMock('tone', () => ToneMock)
}