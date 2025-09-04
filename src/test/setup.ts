import '@testing-library/jest-dom'
import 'reflect-metadata' // Required for class-transformer decorators
import { beforeAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Import our custom Tone.js mocks
import { setupToneMocks } from './mocks/tone'

// Setup global mocks
setupToneMocks()

// Mock KGCore globally to prevent store initialization issues
vi.mock('../core/KGCore', () => ({
  KGCore: {
    instance: vi.fn().mockReturnValue({
      getCurrentProject: vi.fn().mockReturnValue({
        getName: vi.fn().mockReturnValue('Test Project'),
        getBpm: vi.fn().mockReturnValue(120),
        getTimeSignature: vi.fn().mockReturnValue({ numerator: 4, denominator: 4 }),
        getTracks: vi.fn().mockReturnValue([])
      }),
      getSelectedItems: vi.fn().mockReturnValue([]),
      setSelectedItems: vi.fn(),
      executeCommand: vi.fn()
    })
  }
}))

// Global test setup for all unit tests

// Clean up after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Setup before all tests
beforeAll(() => {
  // Mock console methods to reduce noise in tests
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  
  // Mock window.matchMedia (needed for some UI components)
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock ResizeObserver (might be needed for some components)
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock URL.createObjectURL (might be needed for file operations)
  global.URL.createObjectURL = vi.fn(() => 'mocked-url')
  global.URL.revokeObjectURL = vi.fn()
})