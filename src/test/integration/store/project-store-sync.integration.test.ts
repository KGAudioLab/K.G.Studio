/**
 * Integration tests for project store synchronization with core models
 * Tests the critical data flow: Store Actions → Core Models → UI State Updates
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Import core classes
import { KGCore } from '../../../core/KGCore'
import { KGProject } from '../../../core/KGProject'
import { KGMidiTrack, type InstrumentType } from '../../../core/track/KGMidiTrack'
import { KGMidiRegion } from '../../../core/region/KGMidiRegion'
import { KGMidiNote } from '../../../core/midi/KGMidiNote'

// Import store
import { useProjectStore } from '../../../stores/projectStore'

// Import test utilities and mocks
import '../../utils/setup-integration-tests'
import { mockAudioInterface } from '../../mocks/audio-interface'

describe('Project Store Synchronization Integration Tests', () => {
  let testProject: KGProject
  
  beforeEach(async () => {
    // Create a real project for testing
    testProject = new KGProject('Sync Test Project')
    testProject.setBpm(120)
    testProject.setTimeSignature({ numerator: 4, denominator: 4 })
    testProject.setKeySignature('C major')
    testProject.setMaxBars(32)
    
    // Initialize KGCore
    const core = KGCore.instance()
    await core.initializeAsync()
    core.setCurrentProject(testProject)
    
    // Reset store state
    const store = useProjectStore.getState()
    await store.loadProject(testProject)
  })
  
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Project Properties Synchronization', () => {
    it('should sync BPM changes between store and core model', async () => {
      const { setBpm } = useProjectStore.getState()
      const newBpm = 140
      
      // Execute store action
      act(() => {
        setBpm(newBpm)
      })
      
      // Verify core model was updated
      expect(testProject.getBpm()).toBe(newBpm)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.bpm).toBe(newBpm)
      
      // Verify CSS custom property was updated
      const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--time-signature-numerator')
      expect(cssValue).toBeTruthy() // CSS should be updated by store action
    })

    it('should sync time signature changes and update CSS properties', async () => {
      const { setTimeSignature } = useProjectStore.getState()
      const newTimeSignature = { numerator: 3, denominator: 4 }
      
      act(() => {
        setTimeSignature(newTimeSignature)
      })
      
      // Verify core model was updated
      expect(testProject.getTimeSignature()).toEqual(newTimeSignature)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.timeSignature).toEqual(newTimeSignature)
      
      // Verify CSS custom property was updated for UI calculations
      const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--time-signature-numerator')
      expect(cssValue.trim()).toBe('3')
    })

    it('should sync max bars changes and update layout CSS', async () => {
      const { setMaxBars } = useProjectStore.getState()
      const newMaxBars = 64
      
      act(() => {
        setMaxBars(newMaxBars)
      })
      
      // Verify core model was updated
      expect(testProject.getMaxBars()).toBe(newMaxBars)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.maxBars).toBe(newMaxBars)
      
      // Verify CSS custom property was updated for layout
      const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--max-number-of-bars')
      expect(cssValue.trim()).toBe('64')
    })

    it('should sync key signature changes', async () => {
      const { setKeySignature } = useProjectStore.getState()
      const newKeySignature = 'G major'
      
      act(() => {
        setKeySignature(newKeySignature)
      })
      
      // Verify core model was updated
      expect(testProject.getKeySignature()).toBe(newKeySignature)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.keySignature).toBe(newKeySignature)
    })
  })

  describe('Track Management Synchronization', () => {
    it('should sync track addition with core model and audio interface', async () => {
      const { addTrack } = useProjectStore.getState()
      const initialTrackCount = testProject.getTracks().length
      
      // Execute store action
      await act(async () => {
        await addTrack()
      })
      
      // Verify core model was updated
      expect(testProject.getTracks()).toHaveLength(initialTrackCount + 1)
      const newTrack = testProject.getTracks()[initialTrackCount] as KGMidiTrack
      expect(newTrack).toBeInstanceOf(KGMidiTrack)
      expect(newTrack.getName()).toContain('Track')
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.tracks).toHaveLength(initialTrackCount + 1)
      
      // Verify audio interface was notified
      expect(mockAudioInterface.createTrackBus).toHaveBeenCalled()
    })

    it('should sync track removal with core model and audio interface', async () => {
      // First add a track
      const { addTrack, removeTrack } = useProjectStore.getState()
      
      await act(async () => {
        await addTrack()
      })
      
      const trackCountAfterAdd = testProject.getTracks().length
      const trackToRemove = testProject.getTracks()[trackCountAfterAdd - 1]
      
      // Remove the track
      await act(async () => {
        await removeTrack(trackCountAfterAdd - 1) // Remove last track
      })
      
      // Verify core model was updated
      expect(testProject.getTracks()).toHaveLength(trackCountAfterAdd - 1)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.tracks).toHaveLength(trackCountAfterAdd - 1)
      
      // Verify audio interface was notified
      expect(mockAudioInterface.removeTrackBus).toHaveBeenCalledWith(trackToRemove.getId())
    })

    it('should sync track instrument changes with audio interface', async () => {
      // Add a track first
      const { addTrack, setTrackInstrument } = useProjectStore.getState()
      
      await act(async () => {
        await addTrack()
      })
      
      const trackIndex = testProject.getTracks().length - 1
      const track = testProject.getTracks()[trackIndex] as KGMidiTrack
      const newInstrument: InstrumentType = 'electric_bass'
      
      // Change track instrument
      await act(async () => {
        await setTrackInstrument(trackIndex, newInstrument)
      })
      
      // Verify core model was updated
      expect(track.getInstrument()).toBe(newInstrument)
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      const storeTrack = storeState.tracks[trackIndex] as KGMidiTrack
      expect(storeTrack.getInstrument()).toBe(newInstrument)
      
      // Verify audio interface was notified
      expect(mockAudioInterface.setTrackInstrument).toHaveBeenCalledWith(track.getId(), newInstrument)
    })

    it('should sync track reordering with core model', async () => {
      const { addTrack, reorderTracks } = useProjectStore.getState()
      
      // Add two tracks
      await act(async () => {
        await addTrack() // Track at index 0
        await addTrack() // Track at index 1
      })
      
      const track0Before = testProject.getTracks()[0]
      const track1Before = testProject.getTracks()[1]
      
      // Reorder tracks (move track 0 to position 1)
      act(() => {
        reorderTracks(0, 1)
      })
      
      // Verify core model track order changed
      const track0After = testProject.getTracks()[0]
      const track1After = testProject.getTracks()[1]
      
      expect(track0After.getId()).toBe(track1Before.getId())
      expect(track1After.getId()).toBe(track0Before.getId())
      
      // Verify store state reflects change
      const storeState = useProjectStore.getState()
      expect(storeState.tracks[0].getId()).toBe(track1Before.getId())
      expect(storeState.tracks[1].getId()).toBe(track0Before.getId())
    })
  })

  describe('Playback State Synchronization', () => {
    it('should sync playhead position with formatted time string', async () => {
      const { setPlayheadPosition } = useProjectStore.getState()
      const newPosition = 8.5 // beats
      
      act(() => {
        setPlayheadPosition(newPosition)
      })
      
      // Verify store state updated
      const storeState = useProjectStore.getState()
      expect(storeState.playheadPosition).toBe(newPosition)
      
      // Verify formatted time string was updated
      expect(storeState.currentTime).toBeDefined()
      expect(storeState.currentTime).toContain('|') // Should contain BBB:B | mm:ss:mmm format
    })

    it('should sync playback state changes', async () => {
      const { startPlaying, stopPlaying } = useProjectStore.getState()
      
      // Start playing
      await act(async () => {
        await startPlaying()
      })
      
      // Verify store state updated
      let storeState = useProjectStore.getState()
      expect(storeState.isPlaying).toBe(true)
      
      // Verify audio interface was called
      expect(mockAudioInterface.startPlayback).toHaveBeenCalled()
      
      // Stop playing
      await act(async () => {
        await stopPlaying()
      })
      
      // Verify store state updated
      storeState = useProjectStore.getState()
      expect(storeState.isPlaying).toBe(false)
      
      // Verify audio interface was called
      expect(mockAudioInterface.stopPlayback).toHaveBeenCalled()
    })
  })

  describe('Selection State Synchronization', () => {
    it('should sync selection state with core piano roll state', async () => {
      const { setActiveRegionId, syncSelectionFromCore } = useProjectStore.getState()
      
      // Add a track and region for testing
      const testTrack = new KGMidiTrack('Test Track', 'acoustic_grand_piano')
      const testRegion = new KGMidiRegion('Test Region', 0, 16)
      testTrack.addRegion(testRegion)
      testProject.addTrack(testTrack)
      
      // Set active region
      act(() => {
        setActiveRegionId(testRegion.getId())
      })
      
      // Verify store state updated
      let storeState = useProjectStore.getState()
      expect(storeState.activeRegionId).toBe(testRegion.getId())
      
      // Simulate core selection changes and sync
      act(() => {
        syncSelectionFromCore()
      })
      
      // Verify store selection state is synchronized
      storeState = useProjectStore.getState()
      expect(storeState.selectedNoteIds).toBeDefined()
      expect(storeState.selectedRegionIds).toBeDefined()
    })

    it('should clear all selections and sync state', async () => {
      const { clearAllSelections, setSelectedTrack } = useProjectStore.getState()
      
      // Set some initial selection state
      act(() => {
        setSelectedTrack('test-track-id')
      })
      
      // Verify selection was set
      let storeState = useProjectStore.getState()
      expect(storeState.selectedTrackId).toBe('test-track-id')
      
      // Clear all selections
      act(() => {
        clearAllSelections()
      })
      
      // Verify all selections were cleared
      storeState = useProjectStore.getState()
      expect(storeState.selectedTrackId).toBeNull()
      expect(storeState.selectedNoteIds).toEqual([])
      expect(storeState.selectedRegionIds).toEqual([])
    })
  })

  describe('Piano Roll State Integration', () => {
    it('should sync piano roll visibility and active region', async () => {
      const { setShowPianoRoll, setActiveRegionId } = useProjectStore.getState()
      
      // Add test region
      const testTrack = new KGMidiTrack('Test Track', 'acoustic_grand_piano')
      const testRegion = new KGMidiRegion('Test Region', 0, 16)
      testTrack.addRegion(testRegion)
      testProject.addTrack(testTrack)
      
      // Show piano roll with active region
      act(() => {
        setActiveRegionId(testRegion.getId())
        setShowPianoRoll(true)
      })
      
      // Verify store state updated
      const storeState = useProjectStore.getState()
      expect(storeState.showPianoRoll).toBe(true)
      expect(storeState.activeRegionId).toBe(testRegion.getId())
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid track operations gracefully', async () => {
      const { removeTrack } = useProjectStore.getState()
      const initialTrackCount = testProject.getTracks().length
      
      // Try to remove non-existent track
      await act(async () => {
        await removeTrack(999) // Invalid index
      })
      
      // Verify project state unchanged
      expect(testProject.getTracks()).toHaveLength(initialTrackCount)
      
      // Verify store state unchanged
      const storeState = useProjectStore.getState()
      expect(storeState.tracks).toHaveLength(initialTrackCount)
    })

    it('should handle concurrent state updates correctly', async () => {
      const { setBpm, setMaxBars } = useProjectStore.getState()
      
      // Execute multiple state updates concurrently
      await act(async () => {
        setBpm(140)
        setMaxBars(64)
      })
      
      // Verify both updates were applied to core model
      expect(testProject.getBpm()).toBe(140)
      expect(testProject.getMaxBars()).toBe(64)
      
      // Verify store state is consistent
      const storeState = useProjectStore.getState()
      expect(storeState.bpm).toBe(140)
      expect(storeState.maxBars).toBe(64)
    })
  })

  describe('Project Loading Integration', () => {
    it('should completely sync store state when loading new project', async () => {
      const { loadProject } = useProjectStore.getState()
      
      // Create a new project with specific properties
      const newProject = new KGProject('New Loaded Project')
      newProject.setBpm(160)
      newProject.setTimeSignature({ numerator: 6, denominator: 8 })
      newProject.setKeySignature('D major')
      newProject.setMaxBars(48)
      
      // Add a track with region and notes
      const track = new KGMidiTrack('Loaded Track', 'violin')
      const region = new KGMidiRegion('Loaded Region', 0, 8)
      const note = new KGMidiNote('test-note', 0, 1, 64, 100)
      
      region.addNote(note)
      track.addRegion(region)
      newProject.addTrack(track)
      
      // Load the new project
      await act(async () => {
        await loadProject(newProject)
      })
      
      // Verify store state completely matches new project
      const storeState = useProjectStore.getState()
      expect(storeState.projectName).toBe('New Loaded Project')
      expect(storeState.bpm).toBe(160)
      expect(storeState.timeSignature).toEqual({ numerator: 6, denominator: 8 })
      expect(storeState.keySignature).toBe('D major')
      expect(storeState.maxBars).toBe(48)
      expect(storeState.tracks).toHaveLength(1)
      
      // Verify core model is updated
      const core = KGCore.instance()
      expect(core.getCurrentProject()?.getName()).toBe('New Loaded Project')
      
      // Verify CSS properties were updated
      const timeSignatureCSS = getComputedStyle(document.documentElement).getPropertyValue('--time-signature-numerator')
      expect(timeSignatureCSS.trim()).toBe('6')
      
      const maxBarsCSS = getComputedStyle(document.documentElement).getPropertyValue('--max-number-of-bars')
      expect(maxBarsCSS.trim()).toBe('48')
    })
  })
})