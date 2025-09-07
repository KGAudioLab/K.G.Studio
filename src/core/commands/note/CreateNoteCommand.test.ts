import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CreateNoteCommand } from './CreateNoteCommand'
import { KGCore } from '../../KGCore'
import { KGMidiNote } from '../../midi/KGMidiNote'
import { createMockProject, createMockMidiTrack, createMockMidiRegion } from '../../../test/utils/mock-data'

// Mock the KGCore singleton
vi.mock('../../KGCore', () => ({
  KGCore: {
    instance: vi.fn()
  }
}))

// Mock generateUniqueId utility
vi.mock('../../../util/miscUtil', () => ({
  generateUniqueId: vi.fn().mockReturnValue('mock-note-id')
}))

// Import the mocked function properly
const { generateUniqueId } = await import('../../../util/miscUtil')

interface MockCore {
  getCurrentProject: ReturnType<typeof vi.fn>
}

describe('CreateNoteCommand', () => {
  let mockCore: MockCore
  let mockProject: ReturnType<typeof createMockProject>
  let mockTrack: ReturnType<typeof createMockMidiTrack>
  let mockRegion: ReturnType<typeof createMockMidiRegion>
  let command: CreateNoteCommand

  beforeEach(() => {
    // Create test data
    mockRegion = createMockMidiRegion({ 
      id: 'test-region',
      trackId: 'test-track',
      name: 'Test Region' 
    })
    
    mockTrack = createMockMidiTrack({ 
      id: 1, 
      name: 'Test Track',
      regions: [mockRegion] 
    })
    
    mockProject = createMockProject({ 
      name: 'Test Project',
      tracks: [mockTrack] 
    })

    // Mock KGCore methods
    mockCore = {
      getCurrentProject: vi.fn().mockReturnValue(mockProject)
    }
    
    vi.mocked(KGCore.instance).mockReturnValue(mockCore as unknown as KGCore)

    // Create command
    command = new CreateNoteCommand(
      'test-region', // regionId
      0,            // startBeat
      1,            // endBeat
      60,           // pitch (middle C)
      80            // velocity
    )
  })

  describe('constructor', () => {
    it('should create command with correct parameters', () => {
      const cmd = new CreateNoteCommand('region-1', 2, 4, 72, 100, 'custom-id')
      
      expect(cmd).toBeInstanceOf(CreateNoteCommand)
      // We can't directly test private properties, but we can test execution
    })

    it('should generate unique ID when not provided', () => {
      new CreateNoteCommand('region-1', 0, 1, 60, 80)
      
      // The generateUniqueId mock should have been called
      expect(generateUniqueId).toHaveBeenCalledWith('KGMidiNote')
    })

    it('should use provided ID when given', () => {
      // Clear previous calls
      vi.clearAllMocks()
      
      new CreateNoteCommand('region-1', 0, 1, 60, 80, 'my-custom-id')
      
      // Should not call generateUniqueId when ID is provided
      expect(generateUniqueId).not.toHaveBeenCalled()
    })
  })

  describe('execute', () => {
    it('should create a note in the target region', () => {
      // Mock the addNote method
      const addNoteSpy = vi.spyOn(mockRegion, 'addNote')
      
      // Execute the command
      command.execute()
      
      // Verify note was added
      expect(addNoteSpy).toHaveBeenCalledTimes(1)
      
      // Verify the note has correct properties
      const addedNote = addNoteSpy.mock.calls[0][0] as KGMidiNote
      expect(addedNote).toBeInstanceOf(KGMidiNote)
      expect(addedNote.getStartBeat()).toBe(0)
      expect(addedNote.getEndBeat()).toBe(1)
      expect(addedNote.getPitch()).toBe(60)
      expect(addedNote.getVelocity()).toBe(80)
    })

    it('should throw error for non-existent region', () => {
      // Create command for non-existent region
      const badCommand = new CreateNoteCommand('non-existent-region', 0, 1, 60, 80)
      
      // Should throw error for non-existent region
      expect(() => badCommand.execute()).toThrow('MIDI region with ID non-existent-region not found')
    })

    it('should store created note for undo operation', () => {
      const addNoteSpy = vi.spyOn(mockRegion, 'addNote')
      
      command.execute()
      
      // Note should be created and stored internally for undo
      expect(addNoteSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('undo', () => {
    it('should remove the created note', () => {
      // Execute first to create the note
      command.execute()
      
      // Mock removeNote method
      const removeNoteSpy = vi.spyOn(mockRegion, 'removeNote')
      
      // Undo the command
      command.undo()
      
      // Verify note was removed
      expect(removeNoteSpy).toHaveBeenCalledTimes(1)
    })

    it('should throw error when undoing without execute', () => {
      // Try to undo without executing first
      expect(() => command.undo()).toThrow('Cannot undo: no note was created')
    })
  })

  describe('re-execute (redo pattern)', () => {
    it('should re-add the note after undo using execute', () => {
      // Execute, undo, then execute again (redo pattern)
      command.execute()
      command.undo()
      
      const addNoteSpy = vi.spyOn(mockRegion, 'addNote')
      command.execute() // Commands are re-executed for redo
      
      // Note should be added again
      expect(addNoteSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('getDescription', () => {
    it('should return descriptive text', () => {
      const description = command.getDescription()
      
      expect(description).toBeDefined()
      expect(typeof description).toBe('string')
      expect(description.length).toBeGreaterThan(0)
    })
  })

  describe('command lifecycle', () => {
    it('should support multiple execute/undo cycles', () => {
      const addNoteSpy = vi.spyOn(mockRegion, 'addNote')
      const removeNoteSpy = vi.spyOn(mockRegion, 'removeNote')
      
      // Execute -> Undo -> Execute -> Undo
      command.execute()
      expect(addNoteSpy).toHaveBeenCalledTimes(1)
      
      command.undo()
      expect(removeNoteSpy).toHaveBeenCalledTimes(1)
      
      command.execute() // Re-execute for redo
      expect(addNoteSpy).toHaveBeenCalledTimes(2)
      
      command.undo()
      expect(removeNoteSpy).toHaveBeenCalledTimes(2)
    })
  })
})