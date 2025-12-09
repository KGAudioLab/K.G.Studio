/**
 * Mock implementation of KGAudioInterface for integration tests
 * Provides interface compatibility while avoiding actual audio operations
 */
import { vi } from 'vitest'

export const mockAudioInterface = {
  // Audio context management
  startAudioContext: vi.fn().mockResolvedValue(true),
  isAudioContextStarted: vi.fn().mockReturnValue(true),
  
  // Track management
  createTrackBus: vi.fn().mockResolvedValue(undefined),
  setTrackInstrument: vi.fn().mockResolvedValue(undefined),
  setTrackVolume: vi.fn().mockReturnValue(undefined),
  setTrackMuted: vi.fn().mockReturnValue(undefined),
  setTrackSoloed: vi.fn().mockReturnValue(undefined),
  removeTrackBus: vi.fn().mockReturnValue(undefined),
  
  // Playback control
  startPlayback: vi.fn().mockReturnValue(undefined),
  stopPlayback: vi.fn().mockReturnValue(undefined),
  pausePlayback: vi.fn().mockReturnValue(undefined),
  setPlaybackPosition: vi.fn().mockReturnValue(undefined),
  
  // Note scheduling
  scheduleNote: vi.fn().mockReturnValue(undefined),
  scheduleNotes: vi.fn().mockReturnValue(undefined),
  clearScheduledNotes: vi.fn().mockReturnValue(undefined),
  
  // Transport
  getCurrentBeat: vi.fn().mockReturnValue(0),
  setBpm: vi.fn().mockReturnValue(undefined),
  
  // Singleton pattern
  getInstance: vi.fn().mockReturnThis(),
}

// Mock the class constructor
export const mockKGAudioInterfaceClass = vi.fn(() => mockAudioInterface)