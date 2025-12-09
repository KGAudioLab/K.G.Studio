/**
 * Integration test setup utilities
 * Common setup and teardown for integration tests
 */
import { beforeEach, afterEach, vi } from 'vitest'
import { mockAudioInterface } from '../mocks/audio-interface'
import { mockIndexedDB, clearMockStorage } from '../mocks/indexed-db'
import { mockTone } from '../mocks/tone-js'

// Global setup for integration tests
beforeEach(() => {
  // Clear all mocks
  vi.clearAllMocks()
  
  // Clear mock storage
  clearMockStorage()
  
  // Mock external dependencies while keeping internal components real
  vi.doMock('../../audio/KGAudioInterface', () => ({
    KGAudioInterface: mockAudioInterface,
    default: mockAudioInterface,
  }))
  
  vi.doMock('idb', () => mockIndexedDB)
  
  vi.doMock('tone', () => mockTone)
  
  // Mock browser APIs that might be used
  Object.defineProperty(window, 'AudioContext', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      state: 'running',
      resume: vi.fn().mockResolvedValue(undefined),
    })),
  })
  
  Object.defineProperty(window, 'webkitAudioContext', {
    writable: true,
    value: window.AudioContext,
  })
})

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks()
  clearMockStorage()
})

// Helper functions for integration tests
export const createMockProject = () => {
  // Helper to create a basic project for testing
  // This can be expanded as needed
  return {
    id: 'test-project',
    name: 'Test Project',
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: 'C major',
    maxBars: 32,
    tracks: [],
  }
}

export const createMockTrack = (name = 'Test Track') => {
  return {
    id: `track-${Date.now()}`,
    name,
    instrument: 'acoustic_grand_piano',
    volume: 0.8,
    regions: [],
  }
}

export const createMockRegion = (name = 'Test Region') => {
  return {
    id: `region-${Date.now()}`,
    name,
    startBeat: 0,
    endBeat: 4,
    notes: [],
  }
}

export const createMockNote = (pitch = 60, startBeat = 0, endBeat = 1) => {
  return {
    id: `note-${Date.now()}`,
    pitch,
    startBeat,
    endBeat,
    velocity: 100,
  }
}