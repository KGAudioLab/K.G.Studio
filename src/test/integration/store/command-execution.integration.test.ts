/**
 * Integration tests for command execution and undo/redo functionality
 * Tests the complete flow: Command execution → Core model updates → UI state sync
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRoot } from 'react-dom/client'

// Import core classes
import { KGCore } from '../../../core/KGCore'
import { KGProject } from '../../../core/KGProject'
import { KGMidiTrack } from '../../../core/track/KGMidiTrack'
import { KGMidiRegion } from '../../../core/region/KGMidiRegion'
import { KGMidiNote } from '../../../core/midi/KGMidiNote'
import { KGCommandHistory } from '../../../core/commands/KGCommandHistory'

// Import commands
import { CreateNoteCommand } from '../../../core/commands/note/CreateNoteCommand'
import { DeleteNotesCommand } from '../../../core/commands/note/DeleteNotesCommand'
import { AddTrackCommand } from '../../../core/commands/track/AddTrackCommand'

// Import store
import { useProjectStore } from '../../../stores/projectStore'

// Import test utilities
import '../../utils/setup-integration-tests'

describe('Command Execution Integration Tests', () => {
  let testProject: KGProject
  let testTrack: KGMidiTrack
  let testRegion: KGMidiRegion
  
  beforeEach(async () => {
    // Create a real project with track and region for testing
    testProject = new KGProject('Test Project')
    testProject.setBpm(120)
    testProject.setTimeSignature({ numerator: 4, denominator: 4 })
    testProject.setKeySignature('C major')
    testProject.setMaxBars(32)
    
    // Create test track and region
    testTrack = new KGMidiTrack('Test Track', 0, 'acoustic_grand_piano')
    testRegion = new KGMidiRegion('region-1', 'track-0', 0, 'Test Region', 0, 16)

    // Set up the project hierarchy
    testTrack.addRegion(testRegion)
    testProject.setTracks([testTrack])

    // Initialize KGCore with test project
    const core = KGCore.instance()
    await core.initialize()
    core.setCurrentProject(testProject)
    
    // Clear command history
    KGCommandHistory.instance().clear()
    
    // Initialize store with project
    const { loadProject } = useProjectStore.getState()
    await loadProject(testProject)
  })

  describe('Note Command Integration', () => {
    it('should execute CreateNoteCommand and update both core model and store', async () => {
      const regionId = testRegion.getId()
      const initialNoteCount = testRegion.getNotes().length
      
      // Create and execute command
      const createCommand = new CreateNoteCommand(regionId, 0, 1, 60, 100)
      const commandHistory = KGCommandHistory.instance()
      
      // Execute command through command history (simulates real usage)
      act(() => {
        commandHistory.executeCommand(createCommand)
      })
      
      // Verify core model was updated
      const updatedRegion = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(updatedRegion.getNotes()).toHaveLength(initialNoteCount + 1)
      
      const createdNote = updatedRegion.getNotes().find(note => note.getId() === createCommand.getNoteId())
      expect(createdNote).toBeDefined()
      expect(createdNote!.getPitch()).toBe(60)
      expect(createdNote!.getStartBeat()).toBe(0)
      expect(createdNote!.getEndBeat()).toBe(1)
      
      // Verify command history state
      expect(commandHistory.canUndo()).toBe(true)
      expect(commandHistory.canRedo()).toBe(false)
      expect(commandHistory.getUndoDescription()).toBe('Create note C4')
      
      // Verify store undo/redo state is updated
      const storeState = useProjectStore.getState()
      expect(storeState.canUndo).toBe(true)
      expect(storeState.canRedo).toBe(false)
    })

    it('should execute undo and restore previous state', async () => {
      const regionId = testRegion.getId()
      const initialNoteCount = testRegion.getNotes().length
      
      // Create and execute command
      const createCommand = new CreateNoteCommand(regionId, 2, 3, 64, 120) // E4
      const commandHistory = KGCommandHistory.instance()
      
      act(() => {
        commandHistory.executeCommand(createCommand)
      })
      
      // Verify note was created
      const regionAfterCreate = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(regionAfterCreate.getNotes()).toHaveLength(initialNoteCount + 1)
      
      // Execute undo
      act(() => {
        const undoSuccess = commandHistory.undo()
        expect(undoSuccess).toBe(true)
      })
      
      // Verify core model was restored
      const regionAfterUndo = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(regionAfterUndo.getNotes()).toHaveLength(initialNoteCount)
      
      // Verify the specific note was removed
      const noteExists = regionAfterUndo.getNotes().some(note => note.getId() === createCommand.getNoteId())
      expect(noteExists).toBe(false)
      
      // Verify command history state
      expect(commandHistory.canUndo()).toBe(false)
      expect(commandHistory.canRedo()).toBe(true)
      expect(commandHistory.getRedoDescription()).toBe('Create note E4')
    })

    it('should execute redo and restore forward state', async () => {
      const regionId = testRegion.getId()
      const initialNoteCount = testRegion.getNotes().length
      
      // Create, execute, and undo a command
      const createCommand = new CreateNoteCommand(regionId, 1, 2, 67, 110) // G4
      const commandHistory = KGCommandHistory.instance()
      
      act(() => {
        commandHistory.executeCommand(createCommand)
        commandHistory.undo()
      })
      
      // Verify we're back to initial state
      expect(testRegion.getNotes()).toHaveLength(initialNoteCount)
      
      // Execute redo
      act(() => {
        const redoSuccess = commandHistory.redo()
        expect(redoSuccess).toBe(true)
      })
      
      // Verify core model was restored to post-create state
      const regionAfterRedo = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(regionAfterRedo.getNotes()).toHaveLength(initialNoteCount + 1)
      
      // Verify the specific note was recreated
      const recreatedNote = regionAfterRedo.getNotes().find(note => note.getId() === createCommand.getNoteId())
      expect(recreatedNote).toBeDefined()
      expect(recreatedNote!.getPitch()).toBe(67)
      
      // Verify command history state
      expect(commandHistory.canUndo()).toBe(true)
      expect(commandHistory.canRedo()).toBe(false)
    })
  })

  describe('Multiple Command Integration', () => {
    it('should execute multiple commands and maintain history integrity', async () => {
      const regionId = testRegion.getId()
      const commandHistory = KGCommandHistory.instance()
      
      // Execute multiple note creation commands
      const command1 = new CreateNoteCommand(regionId, 0, 1, 60, 100) // C4
      const command2 = new CreateNoteCommand(regionId, 1, 2, 64, 100) // E4
      const command3 = new CreateNoteCommand(regionId, 2, 3, 67, 100) // G4
      
      act(() => {
        commandHistory.executeCommand(command1)
        commandHistory.executeCommand(command2)
        commandHistory.executeCommand(command3)
      })
      
      // Verify all notes were created
      const region = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(region.getNotes()).toHaveLength(3)
      
      // Verify command history
      expect(commandHistory.canUndo()).toBe(true)
      expect(commandHistory.getUndoDescription()).toBe('Create note G4')
      
      // Undo middle command by undoing twice
      act(() => {
        commandHistory.undo() // Remove G4
        commandHistory.undo() // Remove E4
      })
      
      // Verify only first note remains
      expect(region.getNotes()).toHaveLength(1)
      expect(region.getNotes()[0].getPitch()).toBe(60) // C4
      
      // Verify redo state
      expect(commandHistory.canRedo()).toBe(true)
      expect(commandHistory.getRedoDescription()).toBe('Create note E4')
    })

    it('should handle command execution with different command types', async () => {
      const commandHistory = KGCommandHistory.instance()
      const initialTrackCount = testProject.getTracks().length
      
      // Execute track addition command
      const addTrackCommand = new AddTrackCommand(1, 'Bass Track', 'acoustic_bass')
      
      act(() => {
        commandHistory.executeCommand(addTrackCommand)
      })
      
      // Verify track was added to core model
      expect(testProject.getTracks()).toHaveLength(initialTrackCount + 1)
      const newTrack = testProject.getTracks()[initialTrackCount] as KGMidiTrack
      expect(newTrack.getName()).toBe('Bass Track')
      expect(newTrack.getInstrument()).toBe('acoustic_bass')
      
      // Add a note to the original region
      const createNoteCommand = new CreateNoteCommand(testRegion.getId(), 0, 1, 48, 100) // C3
      
      act(() => {
        commandHistory.executeCommand(createNoteCommand)
      })
      
      // Verify both commands are in history
      expect(commandHistory.canUndo()).toBe(true)
      expect(commandHistory.getUndoDescription()).toBe('Create note C3')
      
      // Undo both commands
      act(() => {
        commandHistory.undo() // Undo note creation
        commandHistory.undo() // Undo track addition
      })
      
      // Verify both operations were undone
      expect(testProject.getTracks()).toHaveLength(initialTrackCount)
      const originalRegion = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(originalRegion.getNotes()).toHaveLength(0)
    })
  })

  describe('Error Handling Integration', () => {
    it('should handle command execution errors gracefully', async () => {
      const commandHistory = KGCommandHistory.instance()
      
      // Try to create note in non-existent region
      const invalidCommand = new CreateNoteCommand('invalid-region-id', 0, 1, 60, 100)
      
      // Execute command - should not throw but should not add to history
      act(() => {
        commandHistory.executeCommand(invalidCommand)
      })
      
      // Verify command was not added to history due to execution failure
      expect(commandHistory.canUndo()).toBe(false)
      expect(commandHistory.getUndoDescription()).toBeNull()
      
      // Verify project state unchanged
      const region = testProject.getTracks()[0].getRegions()[0] as KGMidiRegion
      expect(region.getNotes()).toHaveLength(0)
    })

    it('should handle undo failures gracefully', async () => {
      const regionId = testRegion.getId()
      const commandHistory = KGCommandHistory.instance()
      
      // Create a command that will succeed initially
      const createCommand = new CreateNoteCommand(regionId, 0, 1, 60, 100)
      
      act(() => {
        commandHistory.executeCommand(createCommand)
      })
      
      // Manually remove the region to cause undo to fail
      testTrack.removeRegion(testRegion.getId())
      
      // Try to undo - should fail gracefully
      act(() => {
        const undoSuccess = commandHistory.undo()
        expect(undoSuccess).toBe(false)
      })
      
      // Verify command is still in undo stack after failed undo
      expect(commandHistory.canUndo()).toBe(true)
    })
  })

  describe('Store Integration', () => {
    it('should keep store undo/redo state synchronized with command history', async () => {
      const regionId = testRegion.getId()
      const commandHistory = KGCommandHistory.instance()
      const { syncUndoRedoState } = useProjectStore.getState()

      // Initial state
      expect(useProjectStore.getState().canUndo).toBe(false)
      expect(useProjectStore.getState().canRedo).toBe(false)

      // Execute command
      const createCommand = new CreateNoteCommand(regionId, 0, 1, 60, 100)

      act(() => {
        commandHistory.executeCommand(createCommand)
        syncUndoRedoState() // Simulate store sync
      })

      // Verify store state updated
      let storeState = useProjectStore.getState()
      expect(storeState.canUndo).toBe(true)
      expect(storeState.canRedo).toBe(false)
      expect(storeState.undoDescription).toBe('Create note C4')
      expect(storeState.redoDescription).toBeNull()

      // Execute undo
      act(() => {
        commandHistory.undo()
        syncUndoRedoState() // Simulate store sync
      })

      // Verify store state updated after undo
      storeState = useProjectStore.getState()
      expect(storeState.canUndo).toBe(false)
      expect(storeState.canRedo).toBe(true)
      expect(storeState.undoDescription).toBeNull()
      expect(storeState.redoDescription).toBe('Create note C4')
    })
  })
})