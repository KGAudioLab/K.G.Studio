import { KGMidiNote } from '../../core/midi/KGMidiNote'
import { KGProject } from '../../core/KGProject'
import { KGMidiTrack } from '../../core/track/KGMidiTrack'
import { KGMidiRegion } from '../../core/region/KGMidiRegion'

/**
 * Test data factories for creating mock objects
 * These help create consistent test data across different test files
 */

export const createMockMidiNote = (overrides: Partial<{
  pitch: number
  velocity: number
  startBeat: number
  endBeat: number
  id: string
}> = {}): KGMidiNote => {
  const defaults = {
    id: 'test-note-1',
    startBeat: 0,
    endBeat: 1,
    pitch: 60, // Middle C
    velocity: 80,
    ...overrides
  }
  
  return new KGMidiNote(
    defaults.id,
    defaults.startBeat,
    defaults.endBeat,
    defaults.pitch,
    defaults.velocity
  )
}

export const createMockMidiRegion = (overrides: Partial<{
  id: string
  trackId: string
  trackIndex: number
  name: string
  startFromBeat: number
  length: number
  notes: KGMidiNote[]
}> = {}): KGMidiRegion => {
  const defaults = {
    id: 'test-region-1',
    trackId: 'test-track-1',
    trackIndex: 0,
    name: 'Test Region',
    startFromBeat: 0,
    length: 4,
    ...overrides
  }
  
  const region = new KGMidiRegion(
    defaults.id,
    defaults.trackId,
    defaults.trackIndex,
    defaults.name,
    defaults.startFromBeat,
    defaults.length
  )
  
  // Add notes if provided
  if (overrides.notes) {
    overrides.notes.forEach(note => region.addNote(note))
  }
  
  return region
}

export const createMockMidiTrack = (overrides: Partial<{
  name: string
  id: number
  instrument: string
  volume: number
  regions: KGMidiRegion[]
}> = {}): KGMidiTrack => {
  const defaults = {
    name: 'Test Track',
    id: 0,
    instrument: 'acoustic_grand_piano' as const,
    volume: 0.8,
    ...overrides
  }
  
  const track = new KGMidiTrack(
    defaults.name,
    defaults.id,
    defaults.instrument as keyof typeof import('../../constants/generalMidiConstants').FLUIDR3_INSTRUMENT_MAP,
    defaults.volume
  )
  
  // Add regions if provided
  if (overrides.regions) {
    track.setRegions(overrides.regions)
  }
  
  return track
}

export const createMockProject = (overrides: Partial<{
  name: string
  bpm: number
  timeSignature: { numerator: number; denominator: number }
  tracks: KGMidiTrack[]
}> = {}): KGProject => {
  const defaults = {
    name: 'Test Project',
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [],
    ...overrides
  }
  
  const project = new KGProject(
    defaults.name,
    32, // maxBars
    0,  // currentBars
    defaults.bpm,
    defaults.timeSignature,
    'C major', // keySignature
    defaults.tracks, // tracks
    1 // projectStructureVersion
  )
  
  return project
}

// Common test scenarios
export const createBasicProjectWithTrack = (): { project: KGProject; track: KGMidiTrack; region: KGMidiRegion } => {
  const notes = [
    createMockMidiNote({ pitch: 60, startBeat: 0, endBeat: 1 }),
    createMockMidiNote({ pitch: 64, startBeat: 1, endBeat: 2 }),
  ]
  
  const region = createMockMidiRegion({ 
    id: 'region-1',
    trackId: 'track-1',
    notes 
  })
  
  const track = createMockMidiTrack({ 
    id: 1,
    name: 'Track 1',
    regions: [region] 
  })
  
  const project = createMockProject({ 
    name: 'Basic Test Project',
    tracks: [track] 
  })
  
  return { project, track, region }
}