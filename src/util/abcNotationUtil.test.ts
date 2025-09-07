import { describe, it, expect, beforeEach, vi } from 'vitest'
import { plainToInstance } from 'class-transformer'
import { convertRegionToABCNotation } from './abcNotationUtil'
import { KGMidiRegion } from '../core/region/KGMidiRegion'
import { KGMidiTrack } from '../core/track/KGMidiTrack'
import { KGCore } from '../core/KGCore'
import { KGProject } from '../core/KGProject'

// Import the test fixture
import joyProjectData from '../test/fixtures/joy-project.json'

// Helper function to load project using real class-transformer deserialization (same as UI)
function loadProjectFromJSON(projectData: Record<string, unknown>): KGProject {
  // Use the exact same deserialization process as the UI (Toolbar.tsx handleKGStudioJSONImport)
  const deserializedResult = plainToInstance(KGProject, projectData)
  
  // Handle case where plainToInstance might return an array (same as UI)
  const deserializedProject = Array.isArray(deserializedResult) 
    ? deserializedResult[0] || null 
    : deserializedResult
  
  if (!deserializedProject) {
    throw new Error("Failed to deserialize project data")
  }
  
  return deserializedProject
}

describe('abcNotationUtil - Integration Tests with Real Project Data', () => {
  let joyProject: KGProject

  beforeEach(() => {
    // Simulate the exact same process as Toolbar.tsx handleKGStudioJSONImport
    // First parse as JSON (simulating file.text() -> JSON.parse())
    const fileContent = JSON.stringify(joyProjectData)
    const projectData = JSON.parse(fileContent)
    
    // Then deserialize using class-transformer (same as UI)
    joyProject = loadProjectFromJSON(projectData)

    // Mock KGCore to return the loaded project (same as production flow)
    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => joyProject
    } as unknown as KGCore)
  })

  describe('convertRegionToABCNotation with real project data', () => {
    it('should convert joy project melody region to exact ABC notation', () => {
      // Get the melody track and region using real project structure
      const melodyTrack = joyProject.getTracks()[0] as KGMidiTrack
      expect(melodyTrack.getName()).toBe('Melody')
      expect(melodyTrack.getRegions()).toHaveLength(1)

      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion
      expect(melodyRegion.getName()).toBe('Melody Region 1')
      expect(melodyRegion.getNotes()).toHaveLength(30) // Verify we have all 30 notes

      // Convert to ABC notation using real region data
      const result = convertRegionToABCNotation(melodyRegion, 0, 32)

      // Expected ABC notation output (exactly as provided)
      const expectedABCNotation = `X:1
T:Melody Region 1
M:4/4
L:1/4
Q:1/4=125
K:C
E E F G | G F E D | C C D E | E3/2 D1/2 D2 | E E F G | G F E D | C C D E | D3/2 C1/2 C2 |`

      // Verify exact match
      expect(result).toBe(expectedABCNotation)
    })

    it('should handle empty pad chord region from real project', () => {
      // Get the pad chord track and region
      const padTrack = joyProject.getTracks()[1] as KGMidiTrack
      expect(padTrack.getName()).toBe('Pad Chord')
      expect(padTrack.getInstrument()).toBe('pad_1_new_age')

      const padRegion = padTrack.getRegions()[0] as KGMidiRegion
      expect(padRegion.getName()).toBe('Pad Chord Region 1')
      expect(padRegion.getNotes()).toHaveLength(0) // Empty region

      // Convert empty region to ABC notation
      const result = convertRegionToABCNotation(padRegion, 0, 32)

      // Verify it contains rest notation and proper headers
      expect(result).toBeDefined()
      expect(result).toContain('T:Pad Chord Region 1')
      expect(result).toContain('M:4/4')
      expect(result).toContain('Q:1/4=125')
      expect(result).toContain('K:C')
      expect(result).toContain('z') // Should contain rest notation
    })

    it('should use correct project settings from real project data', () => {
      // Verify project settings are loaded correctly
      expect(joyProject.getName()).toBe('joy')
      expect(joyProject.getBpm()).toBe(125)
      expect(joyProject.getTimeSignature()).toEqual({ numerator: 4, denominator: 4 })
      expect(joyProject.getKeySignature()).toBe('C major')
      expect(joyProject.getMaxBars()).toBe(32)

      // These settings should be reflected in ABC notation headers
      const melodyTrack = joyProject.getTracks()[0] as KGMidiTrack
      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion
      const result = convertRegionToABCNotation(melodyRegion, 0, 32)

      expect(result).toContain('Q:1/4=125') // BPM
      expect(result).toContain('M:4/4') // Time signature
      expect(result).toContain('K:C') // Key signature
    })

    it('should handle real note timing and pitches correctly', () => {
      const melodyTrack = joyProject.getTracks()[0] as KGMidiTrack
      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion
      const notes = melodyRegion.getNotes()

      // Verify some key notes from the real data
      expect(notes[0].getPitch()).toBe(64) // First note is E (64)
      expect(notes[0].getStartBeat()).toBe(0)
      expect(notes[0].getEndBeat()).toBe(1)

      expect(notes[3].getPitch()).toBe(67) // Fourth note is G (67)
      expect(notes[3].getStartBeat()).toBe(3)
      expect(notes[3].getEndBeat()).toBe(4)

      // Verify fractional timing note (beat 12-13.5)
      const fractionalNote = notes.find(note => note.getEndBeat() === 13.5)
      expect(fractionalNote).toBeDefined()
      expect(fractionalNote!.getPitch()).toBe(64) // E
      expect(fractionalNote!.getStartBeat()).toBe(12)

      // Convert and verify these real timings are reflected in ABC notation
      const result = convertRegionToABCNotation(melodyRegion, 0, 32)
      expect(result).toContain('E3/2 D1/2') // Fractional timing should appear in ABC
    })

    it('should handle multiple tracks with different instruments', () => {
      const tracks = joyProject.getTracks()
      expect(tracks).toHaveLength(2)

      // Verify track properties from real project
      const melodyTrack = tracks[0] as KGMidiTrack
      expect(melodyTrack.getName()).toBe('Melody')
      expect(melodyTrack.getInstrument()).toBe('acoustic_grand_piano')
      expect(melodyTrack.getVolume()).toBe(0.8)

      const padTrack = tracks[1] as KGMidiTrack
      expect(padTrack.getName()).toBe('Pad Chord')
      expect(padTrack.getInstrument()).toBe('pad_1_new_age')
      expect(padTrack.getVolume()).toBe(1)

      // Both tracks should be processable for ABC notation
      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion
      const padRegion = padTrack.getRegions()[0] as KGMidiRegion

      const melodyABC = convertRegionToABCNotation(melodyRegion, 0, 32)
      const padABC = convertRegionToABCNotation(padRegion, 0, 32)

      expect(melodyABC).toContain('T:Melody Region 1')
      expect(padABC).toContain('T:Pad Chord Region 1')
    })

    it('should verify complete deserialization hierarchy', () => {
      // Test that class-transformer properly restored the entire object hierarchy
      expect(joyProject).toBeInstanceOf(KGProject)
      
      const tracks = joyProject.getTracks()
      tracks.forEach(track => {
        expect(track).toBeInstanceOf(KGMidiTrack)
        
        const regions = track.getRegions()
        regions.forEach(region => {
          expect(region).toBeInstanceOf(KGMidiRegion)
          
          const notes = (region as KGMidiRegion).getNotes()
          notes.forEach(note => {
            // Notes should have proper methods and properties
            expect(typeof note.getId()).toBe('string')
            expect(typeof note.getPitch()).toBe('number')
            expect(typeof note.getStartBeat()).toBe('number')
            expect(typeof note.getEndBeat()).toBe('number')
            expect(typeof note.getVelocity()).toBe('number')
          })
        })
      })

      // Verify type identifiers are preserved
      tracks.forEach(track => {
        expect((track as KGMidiTrack).getCurrentType()).toBe('KGMidiTrack')
      })
    })
  })

  describe('edge cases with real project data', () => {
    it('should handle partial region conversion', () => {
      const melodyTrack = joyProject.getTracks()[0] as KGMidiTrack
      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion

      // Test converting only first 8 beats (2 bars)
      const result = convertRegionToABCNotation(melodyRegion, 0, 8)
      
      expect(result).toBeDefined()
      expect(result).toContain('T:Melody Region 1')
      // Should only contain the first 2 bars of music
      expect(result).not.toContain('D3/2 C1/2 C2') // This appears later in the song
    })

    it('should handle mid-region start point', () => {
      const melodyTrack = joyProject.getTracks()[0] as KGMidiTrack
      const melodyRegion = melodyTrack.getRegions()[0] as KGMidiRegion

      // Test converting from beat 16 to 24 (second half of melody)
      const result = convertRegionToABCNotation(melodyRegion, 16, 24)
      
      expect(result).toBeDefined()
      expect(result).toContain('T:Melody Region 1')
      // Should start from the second repetition
      const lines = result.split('\n')
      const musicLine = lines[lines.length - 1] // Last line contains the music
      expect(musicLine).toBeTruthy()
    })
  })
})