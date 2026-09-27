import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import { KGMidiPitchBend } from '../../core/midi/KGMidiPitchBend';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { quarterNotesToTicks } from '../../core/timing';

/**
 * Test data factories for creating mock objects
 * These help create consistent test data across different test files
 */

export const createMockMidiNote = (overrides: Partial<{
  pitch: number
  velocity: number
  startTick: number
  endTick: number
  id: string
}> = {}): KGMidiNote => {
  const defaults = {
    id: 'test-note-1',
    startTick: 0,
    endTick: 1,
    pitch: 60, // Middle C
    velocity: 80,
    ...overrides
  };
  
  return new KGMidiNote(
    defaults.id,
    quarterNotesToTicks(defaults.startTick),
    quarterNotesToTicks(defaults.endTick),
    defaults.pitch,
    defaults.velocity
  );
};

export const createMockMidiRegion = (overrides: Partial<{
  id: string
  trackId: string
  trackIndex: number
  name: string
  startTick: number
  length: number
  notes: KGMidiNote[]
  pitchBends: KGMidiPitchBend[]
  controllerEventsByType: KGMidiControllerEvent[][]
}> = {}): KGMidiRegion => {
  const defaults = {
    id: 'test-region-1',
    trackId: 'test-track-1',
    trackIndex: 0,
    name: 'Test Region',
    startTick: 0,
    length: 4,
    ...overrides
  };
  
  const region = new KGMidiRegion(
    defaults.id,
    defaults.trackId,
    defaults.trackIndex,
    defaults.name,
    quarterNotesToTicks(defaults.startTick),
    quarterNotesToTicks(defaults.length)
  );
  
  // Add notes if provided
  if (overrides.notes) {
    overrides.notes.forEach(note => region.addNote(note));
  }
  if (overrides.pitchBends) {
    overrides.pitchBends.forEach(pitchBend => region.addPitchBend(pitchBend));
  }
  if (overrides.controllerEventsByType) {
    region.setControllerEventsByType(overrides.controllerEventsByType);
  }
  
  return region;
};

export const createMockMidiPitchBend = (overrides: Partial<{
  id: string
  beat: number
  value: number
}> = {}): KGMidiPitchBend => {
  const defaults = {
    id: 'test-bend-1',
    beat: 0,
    value: 8192,
    ...overrides,
  };

  return new KGMidiPitchBend(defaults.id, quarterNotesToTicks(defaults.beat), defaults.value);
};

export const createMockMidiControllerEvent = (overrides: Partial<{
  id: string
  beat: number
  value: number
}> = {}): KGMidiControllerEvent => {
  const defaults = {
    id: 'test-controller-1',
    beat: 0,
    value: 127,
    ...overrides,
  };

  return new KGMidiControllerEvent(defaults.id, quarterNotesToTicks(defaults.beat), defaults.value);
};

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
    volume: 0,
    ...overrides
  };
  
  const track = new KGMidiTrack(
    defaults.name,
    defaults.id,
    defaults.instrument as keyof typeof import('../../constants/generalMidiConstants').FLUIDR3_INSTRUMENT_MAP,
    defaults.volume
  );
  
  // Add regions if provided
  if (overrides.regions) {
    track.setRegions(overrides.regions);
  }
  
  return track;
};

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
  };
  
  const project = new KGProject(
    defaults.name,
    32, // maxBars
    0,  // currentBars
    defaults.bpm,
    defaults.timeSignature,
    'C major', // keySignature
    'ionian', // selectedMode
    false, // isLooping
    [0, 0], // loopingRange
    1, // barWidthMultiplier
    defaults.tracks, // tracks
    KGProject.CURRENT_PROJECT_STRUCTURE_VERSION // projectStructureVersion
  );
  
  return project;
};

// Common test scenarios
export const createBasicProjectWithTrack = (): { project: KGProject; track: KGMidiTrack; region: KGMidiRegion } => {
  const notes = [
    createMockMidiNote({ pitch: 60, startTick: 0, endTick: 1 }),
    createMockMidiNote({ pitch: 64, startTick: 1, endTick: 2 }),
  ];
  
  const region = createMockMidiRegion({ 
    id: 'region-1',
    trackId: 'track-1',
    notes 
  });
  
  const track = createMockMidiTrack({ 
    id: 1,
    name: 'Track 1',
    regions: [region] 
  });
  
  const project = createMockProject({ 
    name: 'Basic Test Project',
    tracks: [track] 
  });
  
  return { project, track, region };
};
