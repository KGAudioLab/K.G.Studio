/**
 * Mock implementation of Tone.js for integration tests
 * Provides interface compatibility while avoiding actual audio operations
 */
import { vi } from 'vitest'

// Mock Sampler class
export const mockSampler = {
  triggerAttackRelease: vi.fn(),
  triggerAttack: vi.fn(),
  triggerRelease: vi.fn(),
  dispose: vi.fn(),
  loaded: true,
  toDestination: vi.fn().mockReturnThis(),
  connect: vi.fn().mockReturnThis(),
  disconnect: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  get: vi.fn().mockReturnValue({}),
}

// Mock Transport
export const mockTransport = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  position: '0:0:0',
  bpm: { value: 120 },
  timeSignature: [4, 4],
  state: 'stopped',
  schedule: vi.fn(),
  clear: vi.fn(),
  cancel: vi.fn(),
}

// Mock Tone namespace
export const mockTone = {
  Sampler: vi.fn().mockImplementation(() => mockSampler),
  Transport: mockTransport,
  Buffer: vi.fn().mockImplementation(() => ({
    loaded: true,
    duration: 1,
    get: vi.fn(),
    set: vi.fn(),
  })),
  ToneAudioBuffer: vi.fn().mockImplementation(() => ({
    loaded: true,
    duration: 1,
  })),
  start: vi.fn(),
  getContext: vi.fn().mockReturnValue({
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
  }),
  context: {
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
  },
}