import { DEBUG_MODE } from '../constants/uiConstants';
import type { TimeSignature } from '../types/projectTypes';
import { KGProject, type KeySignature } from '../core/KGProject';
import { KGMidiTrack, type InstrumentType } from '../core/track/KGMidiTrack';
import { FLUIDR3_INSTRUMENT_MAP, STANDARD_MIDI_INSTRUMENT_MAP } from '../constants/generalMidiConstants';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { generateUniqueId } from './miscUtil';
import {
  MIDI_HEADER,
  MIDI_TRACK,
  MIDI_TIMING,
  MIDI_EVENTS,
  MIDI_VELOCITY,
  MIDI_TIME_SIGNATURE,
  MIDI_KEY_SIGNATURE,
  MIDI_UTILS
} from '../constants/midiConstants';

export const pianoRollIndexToPitch = (index: number) => {
  return 107 /* MIDI note B7 */ - index;
};

export const pitchToNoteName = (pitch: number) => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return {
    note: noteNames[pitch % 12],
    octave: Math.floor(pitch / 12) - 1
  };
};

export const pitchToNoteNameString = (pitch: number) => {
    const { note, octave } = pitchToNoteName(pitch);
    return `${note}${octave}`;
  };

export const noteNameToPitch = (noteName: string): number => {
  const noteMap: { [key: string]: number } = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
  };
  
  // Parse note name (e.g., "C4", "F#2", "A#7")
  const match = noteName.match(/^([A-G]#?)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid note name: ${noteName}`);
  }
  
  const note = match[1];
  const octave = parseInt(match[2], 10);
  
  if (!(note in noteMap)) {
    throw new Error(`Invalid note: ${note}`);
  }
  
  return noteMap[note] + (octave + 1) * 12;
};

export const beatsToBar = (beats: number, timeSignature: TimeSignature) => {
  return {
    bar: Math.floor(beats / timeSignature.numerator),
    beatInBar: beats % timeSignature.numerator
  };
};

export const midiPercussionKeyMap: Record<number, { fullName: string; shortName: string }> = {
  35: { fullName: 'Acoustic Bass Drum', shortName: 'Ac.Bass' },
  36: { fullName: 'Bass Drum 1', shortName: 'BassDrum' },
  37: { fullName: 'Side Stick', shortName: 'SideStick' },
  38: { fullName: 'Acoustic Snare', shortName: 'Ac.Snare' },
  39: { fullName: 'Hand Clap', shortName: 'HandClap' },
  40: { fullName: 'Electric Snare', shortName: 'ElecSnare' },
  41: { fullName: 'Low Floor Tom', shortName: 'LowFloor' },
  42: { fullName: 'Closed Hi Hat', shortName: 'ClosedHH' },
  43: { fullName: 'High Floor Tom', shortName: 'HighFloor' },
  44: { fullName: 'Pedal Hi-Hat', shortName: 'PedalHH' },
  45: { fullName: 'Low Tom', shortName: 'LowTom' },
  46: { fullName: 'Open Hi-Hat', shortName: 'OpenHH' },
  47: { fullName: 'Low-Mid Tom', shortName: 'LowMidTom' },
  48: { fullName: 'Hi Mid Tom', shortName: 'HiMidTom' },
  49: { fullName: 'Crash Cymbal 1', shortName: 'Crash1' },
  50: { fullName: 'High Tom', shortName: 'HighTom' },
  51: { fullName: 'Ride Cymbal 1', shortName: 'Ride1' },
  52: { fullName: 'Chinese Cymbal', shortName: 'Chinese' },
  53: { fullName: 'Ride Bell', shortName: 'RideBell' },
  54: { fullName: 'Tambourine', shortName: 'Tambourine' },
  55: { fullName: 'Splash Cymbal', shortName: 'Splash' },
  56: { fullName: 'Cowbell', shortName: 'Cowbell' },
  57: { fullName: 'Crash Cymbal 2', shortName: 'Crash2' },
  58: { fullName: 'Vibraslap', shortName: 'Vibraslap' },
  59: { fullName: 'Ride Cymbal 2', shortName: 'Ride2' },
  60: { fullName: 'Hi Bongo', shortName: 'HiBongo' },
  61: { fullName: 'Low Bongo', shortName: 'LowBongo' },
  62: { fullName: 'Mute Hi Conga', shortName: 'MuteHiCon' },
  63: { fullName: 'Open Hi Conga', shortName: 'OpenHiCon' },
  64: { fullName: 'Low Conga', shortName: 'LowConga' },
  65: { fullName: 'High Timbale', shortName: 'HighTimba' },
  66: { fullName: 'Low Timbale', shortName: 'LowTimba' },
  67: { fullName: 'High Agogo', shortName: 'HighAgo' },
  68: { fullName: 'Low Agogo', shortName: 'LowAgo' },
  69: { fullName: 'Cabasa', shortName: 'Cabasa' },
  70: { fullName: 'Maracas', shortName: 'Maracas' },
  71: { fullName: 'Short Whistle', shortName: 'ShortWhis' },
  72: { fullName: 'Long Whistle', shortName: 'LongWhis' },
  73: { fullName: 'Short Guiro', shortName: 'ShortGui' },
  74: { fullName: 'Long Guiro', shortName: 'LongGui' },
  75: { fullName: 'Claves', shortName: 'Claves' },
  76: { fullName: 'Hi Wood Block', shortName: 'HiWood' },
  77: { fullName: 'Low Wood Block', shortName: 'LowWood' },
  78: { fullName: 'Mute Cuica', shortName: 'MuteCuica' },
  79: { fullName: 'Open Cuica', shortName: 'OpenCuica' },
  80: { fullName: 'Mute Triangle', shortName: 'MuteTri' },
  81: { fullName: 'Open Triangle', shortName: 'OpenTri' }
};

/**
 * Converts a KGSP project to standard MIDI format
 * @param project - The KGProject to convert
 * @returns Uint8Array containing the MIDI file data
 */
export const convertProjectToMidi = (project: KGProject): Uint8Array => {
  // Calculate number of tracks (1 tempo track + MIDI tracks)
  const midiTracks = project.getTracks().filter(track => track.getCurrentType() === 'KGMidiTrack') as KGMidiTrack[];
  const totalTracks = 1 + midiTracks.length; // Tempo track + instrument tracks
  
  const chunks: Uint8Array[] = [];
  
  // Set up channel assignment map for 16 MIDI channels (0-15)
  // Value is the assigned GM program number (1-128), 'DRUMS' for percussion, or null if free
  const channelAssignments: (number | 'DRUMS' | null)[] = new Array(16).fill(null);
  // Reserve channel 1 (index 0) for Acoustic Grand Piano (GM program 1)
  channelAssignments[0] = 1;
  // Reserve channel 10 (index 9) for drum kit
  channelAssignments[9] = 'DRUMS';
  
  // 1. Create MIDI header chunk
  chunks.push(...createMidiHeader(totalTracks));
  
  // 2. Create tempo/meta track
  chunks.push(...createTempoTrack(project));
  
  // 3. Create instrument tracks
  midiTracks.forEach((track) => {
    const instrument = track.getInstrument();
    const isDrums = isDrumInstrument(instrument);
    const gmProgram = getGMInstrument(instrument); // 1-128
    const channel = assignChannelForInstrument(gmProgram, isDrums, channelAssignments);

    chunks.push(...createInstrumentTrack(track, project, channel, gmProgram, isDrums));
  });
  
  // Combine all chunks into final MIDI file
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  chunks.forEach(chunk => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  
  return result;
};

/**
 * Creates the MIDI file header chunk
 */
function createMidiHeader(trackCount: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  
  // Header chunk type ("MThd")
  chunks.push(MIDI_HEADER.CHUNK_TYPE);
  
  // Header chunk size (6 bytes)
  chunks.push(MIDI_HEADER.HEADER_SIZE);
  
  // Format type 1 (multi-track)
  chunks.push(MIDI_HEADER.FORMAT_1);
  
  // Number of tracks
  chunks.push(MIDI_UTILS.int16ToBytes(trackCount));
  
  // Time division (TPQN)
  chunks.push(MIDI_TIMING.TPQN_BYTES);
  
  return chunks;
}

/**
 * Creates the tempo/meta track with project settings
 */
function createTempoTrack(project: KGProject): Uint8Array[] {
  const events: Uint8Array[] = [];
  
  // Track name meta event
  events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
  events.push(new Uint8Array([MIDI_EVENTS.META_EVENT, MIDI_EVENTS.META_TRACK_NAME]));
  const trackNameBytes = new TextEncoder().encode('Tempo Track');
  events.push(MIDI_UTILS.encodeVLQ(trackNameBytes.length));
  events.push(trackNameBytes);
  
  // Time signature meta event
  events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
  events.push(new Uint8Array([MIDI_EVENTS.META_EVENT, MIDI_EVENTS.META_TIME_SIGNATURE, 0x04])); // 4 bytes
  const timeSignature = project.getTimeSignature();
  const denomPower = MIDI_TIME_SIGNATURE.DENOMINATOR_MAP[timeSignature.denominator as keyof typeof MIDI_TIME_SIGNATURE.DENOMINATOR_MAP] || 2;
  events.push(new Uint8Array([
    timeSignature.numerator,
    denomPower,
    MIDI_TIME_SIGNATURE.DEFAULT_METRONOME_PULSE,
    MIDI_TIME_SIGNATURE.DEFAULT_32ND_NOTES_PER_QUARTER
  ]));
  
  // Key signature meta event
  events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
  events.push(new Uint8Array([MIDI_EVENTS.META_EVENT, MIDI_EVENTS.META_KEY_SIGNATURE, 0x02])); // 2 bytes
  const keySignature = getKeySignatureBytes(project.getKeySignature());
  events.push(keySignature);
  
  // Tempo meta event
  events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
  events.push(new Uint8Array([MIDI_EVENTS.META_EVENT, MIDI_EVENTS.META_TEMPO, 0x03])); // 3 bytes
  const microsecondsPerQuarter = MIDI_UTILS.bpmToMicrosecondsPerQuarter(project.getBpm());
  events.push(new Uint8Array([
    (microsecondsPerQuarter >> 16) & 0xFF,
    (microsecondsPerQuarter >> 8) & 0xFF,
    microsecondsPerQuarter & 0xFF
  ]));
  
  // End of track
  events.push(MIDI_TRACK.END_OF_TRACK);
  
  return createTrackChunk(events);
}

/**
 * Creates a MIDI track for an instrument
 */
function createInstrumentTrack(
  track: KGMidiTrack,
  project: KGProject,
  channel: number,
  gmProgram: number,
  isDrums: boolean
): Uint8Array[] {
  const events: Uint8Array[] = [];
  
  // Track name meta event
  events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
  events.push(new Uint8Array([MIDI_EVENTS.META_EVENT, MIDI_EVENTS.META_TRACK_NAME]));
  const trackNameBytes = new TextEncoder().encode(track.getName());
  events.push(MIDI_UTILS.encodeVLQ(trackNameBytes.length));
  events.push(trackNameBytes);
  
  // Program change (instrument selection) - skip for drums (channel 10)
  if (!isDrums && channel !== 9) {
    events.push(MIDI_UTILS.encodeVLQ(0)); // Delta time 0
    events.push(new Uint8Array([
      MIDI_EVENTS.PROGRAM_CHANGE | channel,
      Math.max(0, Math.min(127, gmProgram - 1)) // MIDI program change is 0-127
    ]));
  }
  
  // Collect all notes from all regions and sort by absolute time
  const allNotes: Array<{
    note: KGMidiNote;
    absoluteStartBeat: number;
    absoluteEndBeat: number;
  }> = [];
  
  track.getRegions().forEach((region) => {
    // Type guard to ensure we have a KGMidiRegion
    if (region.getCurrentType() === 'KGMidiRegion') {
      const midiRegion = region as KGMidiRegion;
      midiRegion.getNotes().forEach((note: KGMidiNote) => {
        allNotes.push({
          note,
          absoluteStartBeat: midiRegion.getStartFromBeat() + note.getStartBeat(),
          absoluteEndBeat: midiRegion.getStartFromBeat() + note.getEndBeat(),
        });
      });
    }
  });
  
  // Sort notes by start time, then by pitch for consistent ordering
  allNotes.sort((a, b) => {
    const timeDiff = a.absoluteStartBeat - b.absoluteStartBeat;
    return timeDiff !== 0 ? timeDiff : a.note.getPitch() - b.note.getPitch();
  });
  
  // Create MIDI events for notes
  const midiEvents: Array<{
    tick: number;
    event: Uint8Array;
  }> = [];
  
  // Add note on/off events
  allNotes.forEach(({ note, absoluteStartBeat, absoluteEndBeat }) => {
    const startTick = beatToTicks(absoluteStartBeat, project.getTimeSignature());
    const endTick = beatToTicks(absoluteEndBeat, project.getTimeSignature());
    const velocity = Math.max(MIDI_VELOCITY.MIN, Math.min(MIDI_VELOCITY.MAX, note.getVelocity()));
    const pitch = Math.max(0, Math.min(127, note.getPitch()));
    
    // Note On event
    midiEvents.push({
      tick: startTick,
      event: new Uint8Array([
        MIDI_EVENTS.NOTE_ON | channel,
        pitch,
        velocity
      ])
    });
    
    // Note Off event
    midiEvents.push({
      tick: endTick,
      event: new Uint8Array([
        MIDI_EVENTS.NOTE_OFF | channel,
        pitch,
        0 // Release velocity
      ])
    });
  });
  
  // Sort all events by tick time
  midiEvents.sort((a, b) => {
    const timeDiff = a.tick - b.tick;
    // If same time, prioritize note off before note on to avoid conflicts
    if (timeDiff === 0) {
      const aIsNoteOff = (a.event[0] & 0xF0) === MIDI_EVENTS.NOTE_OFF;
      const bIsNoteOff = (b.event[0] & 0xF0) === MIDI_EVENTS.NOTE_OFF;
      if (aIsNoteOff && !bIsNoteOff) return -1;
      if (!aIsNoteOff && bIsNoteOff) return 1;
    }
    return timeDiff;
  });
  
  // Convert to delta time format and add to events
  let previousTick = 0;
  midiEvents.forEach(({ tick, event }) => {
    const deltaTime = tick - previousTick;
    events.push(MIDI_UTILS.encodeVLQ(deltaTime));
    events.push(event);
    previousTick = tick;
  });
  
  // End of track
  events.push(MIDI_TRACK.END_OF_TRACK);
  
  return createTrackChunk(events);
}

/**
 * Creates a track chunk with the given events
 */
function createTrackChunk(events: Uint8Array[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  
  // Track chunk type ("MTrk")
  chunks.push(MIDI_TRACK.CHUNK_TYPE);
  
  // Calculate total data length
  const totalLength = events.reduce((sum, event) => sum + event.length, 0);
  
  // Track chunk size
  chunks.push(MIDI_UTILS.int32ToBytes(totalLength));
  
  // Track data
  chunks.push(...events);
  
  return chunks;
}

/**
 * Converts beats to MIDI ticks
 */
function beatToTicks(beats: number, timeSignature: { numerator: number; denominator: number }): number {
  // In MIDI, ticks are relative to quarter notes
  // Convert beats to quarter notes based on time signature
  const quarterNotesPerBeat = 4 / timeSignature.denominator;
  const quarterNotes = beats * quarterNotesPerBeat;
  return Math.round(quarterNotes * MIDI_TIMING.TPQN);
}

/**
 * Determines if an instrument is a drum kit per FluidR3 map
 */
function isDrumInstrument(instrument: InstrumentType): boolean {
  const key = String(instrument);
  return key === 'standard' || FLUIDR3_INSTRUMENT_MAP[key]?.group === 'PERCUSSION_KIT';
}

/**
 * Assign a MIDI channel for the given GM program and drum flag and update the assignment map
 * - Reserves channel 10 (index 9) for drums
 * - Reserves channel 1 (index 0) for Acoustic Grand Piano (program 1)
 * - Reuses channels that already match the requested program
 * - Falls back to channel 1 if no free channels are available
 */
function assignChannelForInstrument(
  gmProgram: number,
  isDrums: boolean,
  channelAssignments: (number | 'DRUMS' | null)[]
): number {
  // Drums always go to channel 10
  if (isDrums) {
    return 9;
  }
  
  // If requesting Acoustic Grand Piano, use channel 1
  if (gmProgram === 1) {
    return 0;
  }
  
  // Reuse an existing channel already assigned to this program
  for (let ch = 0; ch < 16; ch++) {
    if (channelAssignments[ch] === gmProgram) {
      return ch;
    }
  }
  
  // Find a free channel (skip 0 and 9 which are reserved)
  for (let ch = 0; ch < 16; ch++) {
    if (ch === 0 || ch === 9) continue;
    if (channelAssignments[ch] === null) {
      channelAssignments[ch] = gmProgram;
      return ch;
    }
  }
  
  // No available channel: fall back to channel 1 (piano)
  return 0;
}

/**
 * Gets the General MIDI instrument number
 */
function getGMInstrument(instrument: InstrumentType): number {
  return FLUIDR3_INSTRUMENT_MAP[instrument]?.midiInstrument || 1; // fallback to piano when instrument is not found
}

/**
 * Gets key signature bytes for MIDI format
 */
function getKeySignatureBytes(keySignature: KeySignature): Uint8Array {
  // Check sharp keys
  if (keySignature in MIDI_KEY_SIGNATURE.SHARP_KEYS) {
    const sharps = MIDI_KEY_SIGNATURE.SHARP_KEYS[keySignature as keyof typeof MIDI_KEY_SIGNATURE.SHARP_KEYS];
    return new Uint8Array([sharps, 0]); // 0 = major
  }
  
  // Check flat keys
  if (keySignature in MIDI_KEY_SIGNATURE.FLAT_KEYS) {
    const flats = MIDI_KEY_SIGNATURE.FLAT_KEYS[keySignature as keyof typeof MIDI_KEY_SIGNATURE.FLAT_KEYS];
    return new Uint8Array([flats & 0xFF, 0]); // Convert to unsigned byte, 0 = major
  }
  
  // Check minor keys
  if (keySignature in MIDI_KEY_SIGNATURE.MINOR_KEYS) {
    const accidentals = MIDI_KEY_SIGNATURE.MINOR_KEYS[keySignature as keyof typeof MIDI_KEY_SIGNATURE.MINOR_KEYS];
    return new Uint8Array([accidentals & 0xFF, 1]); // Convert to unsigned byte, 1 = minor
  }
  
  // Default to C major
  return new Uint8Array([0, 0]);
}

/**
 * Converts a MIDI binary file to a KGSP project
 * @param midiData - The MIDI file data as Uint8Array
 * @param existingProject - Optional existing project to merge into (creates new if null/undefined)
 * @returns KGProject with MIDI data converted to KGSP format
 */
export const convertMidiToProject = (midiData: Uint8Array, existingProject?: KGProject | null): KGProject => {
  // Create new project if none provided
  const project = existingProject || new KGProject();
  
  // Parse MIDI file
  const midiFile = parseMidiFile(midiData);
  
  // Apply project-level settings from MIDI meta events (only for new projects)
  if (!existingProject || existingProject.getTracks().length === 0) {
    if (midiFile.tempo) {
      project.setBpm(Math.round(60000000 / midiFile.tempo)); // Convert microseconds per quarter to BPM
    }
    
    if (midiFile.timeSignature) {
      project.setTimeSignature(midiFile.timeSignature);
    }
    
    if (midiFile.keySignature) {
      project.setKeySignature(midiFile.keySignature);
    }
  }
  
  // Get existing tracks to calculate proper track indices
  const existingTracks = project.getTracks();
  const startingTrackIndex = existingTracks.length;
  
  // Convert MIDI tracks to KGSP tracks
  let addedTrackCount = 0;
  midiFile.tracks.forEach((midiTrack, midiTrackIndex) => {
    // Skip tempo tracks (they usually don't have notes)
    if (midiTrack.notes.length === 0) {
      return;
    }
    
    // Determine instrument from MIDI channel and program
    const instrument = getKGInstrumentFromMidi(midiTrack.channel, midiTrack.program);
    
    // Calculate proper track index (append to existing tracks)
    const actualTrackIndex = startingTrackIndex + addedTrackCount;
    
    // Create new KGSP track
    const trackId = Date.now() + midiTrackIndex; // Simple unique ID
    const trackName = midiTrack.name || `Track ${actualTrackIndex + 1}`;
    const kgTrack = new KGMidiTrack(trackName, trackId, instrument);
    kgTrack.setTrackIndex(actualTrackIndex);
    
    // Group notes into regions (every 16 beats for now, could be more sophisticated)
    const regions = groupNotesIntoRegions(midiTrack.notes, project.getTimeSignature());
    
    regions.forEach((regionData, regionIndex) => {
      const regionId = generateUniqueId('KGMidiRegion');
      const regionName = `${trackName} Region ${regionIndex + 1}`;
      const region = new KGMidiRegion(
        regionId,
        trackId.toString(),
        actualTrackIndex,
        regionName,
        regionData.startBeat,
        regionData.length
      );
      
      // Convert MIDI notes to KG notes (with relative timing)
      regionData.notes.forEach(midiNote => {
        const noteId = generateUniqueId('KGMidiNote');
        const relativeStartBeat = midiNote.startBeat - regionData.startBeat;
        const relativeEndBeat = midiNote.endBeat - regionData.startBeat;
        
        const kgNote = new KGMidiNote(
          noteId,
          relativeStartBeat,
          relativeEndBeat,
          midiNote.pitch,
          midiNote.velocity
        );
        
        region.addNote(kgNote);
      });
      
      kgTrack.addRegion(region);
    });
    
    // Add track to project
    project.getTracks().push(kgTrack);
    addedTrackCount += 1;
  });
  
  return project;
};

// MIDI parsing types and interfaces
interface ParsedMidiFile {
  format: number;
  trackCount: number;
  ticksPerQuarter: number;
  tempo?: number; // microseconds per quarter note
  timeSignature?: TimeSignature;
  keySignature?: KeySignature;
  tracks: ParsedMidiTrack[];
}

interface ParsedMidiTrack {
  name?: string;
  channel: number;
  program?: number; // instrument program
  notes: ParsedMidiNote[];
}

interface ParsedMidiNote {
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
}

interface RegionData {
  startBeat: number;
  length: number;
  notes: ParsedMidiNote[];
}

/**
 * Parses a MIDI binary file into a structured format
 */
function parseMidiFile(data: Uint8Array): ParsedMidiFile {
  let offset = 0;
  
  if (DEBUG_MODE.MIDI_IMPORT) {
    console.log('🎵 Starting MIDI file parsing...');
  }
  
  // Parse header chunk
  const headerChunk = parseChunk(data, offset);
  offset += headerChunk.totalSize;
  
  if (headerChunk.type !== 'MThd') {
    throw new Error('Invalid MIDI file: Missing header chunk');
  }
  
  const format = readUint16(headerChunk.data, 0);
  const trackCount = readUint16(headerChunk.data, 2);
  const timeDivision = readUint16(headerChunk.data, 4);
  
  if (DEBUG_MODE.MIDI_IMPORT) {
    console.log('📋 MIDI Header parsed:');
    console.log(`  ├── Format: ${format} (${format === 0 ? 'Single track' : format === 1 ? 'Multi-track' : 'Unknown'})`);
    console.log(`  ├── Track count: ${trackCount}`);
    console.log(`  └── Time division: ${timeDivision} (${timeDivision & 0x8000 ? 'SMPTE' : 'TPQN'})`);
  }
  
  // Only support TPQN format (bit 15 = 0)
  if (timeDivision & 0x8000) {
    throw new Error('SMPTE time division not supported');
  }
  
  const ticksPerQuarter = timeDivision;
  
  const midiFile: ParsedMidiFile = {
    format,
    trackCount,
    ticksPerQuarter,
    tracks: []
  };
  
  if (DEBUG_MODE.MIDI_IMPORT) {
    console.log('🎼 Parsing tracks...');
  }
  
  // Parse track chunks
  for (let i = 0; i < trackCount; i++) {
    if (offset >= data.length) break;
    
    if (DEBUG_MODE.MIDI_IMPORT) {
      console.log(`📝 Parsing track ${i + 1}/${trackCount}...`);
    }
    
    const trackChunk = parseChunk(data, offset);
    offset += trackChunk.totalSize;
    
    if (trackChunk.type !== 'MTrk') {
      console.warn(`Expected track chunk, got ${trackChunk.type}`);
      continue;
    }
    
    const track = parseTrack(trackChunk.data, ticksPerQuarter, midiFile);
    midiFile.tracks.push(track);
    
    if (DEBUG_MODE.MIDI_IMPORT) {
      console.log(`├── ${track.name || `Track ${i + 1}`} (Channel: ${track.channel}, Program: ${track.program ?? 'none'}, Notes: ${track.notes.length})`);
      track.notes.forEach(note => {
        const startTick = Math.round(note.startBeat * ticksPerQuarter);
        const endTick = Math.round(note.endBeat * ticksPerQuarter);
        console.log(`│   ├── ${note.pitch} | ${startTick} | ${endTick}`);
      });
    }
  }
  
  return midiFile;
}

/**
 * Parses a generic MIDI chunk (header or track)
 */
function parseChunk(data: Uint8Array, offset: number) {
  if (offset + 8 > data.length) {
    throw new Error('Invalid MIDI file: Incomplete chunk header');
  }
  
  const type = String.fromCharCode(...data.slice(offset, offset + 4));
  const length = readUint32(data, offset + 4);
  
  if (offset + 8 + length > data.length) {
    throw new Error('Invalid MIDI file: Chunk data exceeds file length');
  }
  
  return {
    type,
    length,
    data: data.slice(offset + 8, offset + 8 + length),
    totalSize: 8 + length
  };
}

/**
 * Parses a MIDI track chunk
 */
function parseTrack(data: Uint8Array, ticksPerQuarter: number, midiFile: ParsedMidiFile): ParsedMidiTrack {
  let offset = 0;
  let currentTick = 0;
  let runningStatus = 0;
  
  const track: ParsedMidiTrack = {
    channel: 0, // Default channel
    notes: []
  };
  
  // Track active notes (for note off events)
  const activeNotes = new Map<string, { startTick: number; pitch: number; velocity: number }>();
  let primaryChannelDetected = false;
  
  while (offset < data.length) {
    // Read delta time
    const deltaTime = readVLQ(data, offset);
    offset += deltaTime.bytesRead;
    currentTick += deltaTime.value;
    
    if (offset >= data.length) break;
    
    // Read status byte (or apply running status)
    let status = data[offset];
    if (status < 0x80) {
      // running status: use previous status, do not advance offset here
      status = runningStatus;
    } else {
      offset++;
      runningStatus = status;
    }

    // Handle Meta and System Exclusive separately (they don't follow the channel-voice pattern)
    if (status === MIDI_EVENTS.META_EVENT) {
      if (offset + 1 > data.length) break;
      const metaType = data[offset];
      offset += 1;

      const metaLength = readVLQ(data, offset);
      offset += metaLength.bytesRead;
      if (offset + metaLength.value > data.length) break;

      const metaData = data.slice(offset, offset + metaLength.value);
      offset += metaLength.value;

      switch (metaType) {
        case MIDI_EVENTS.META_TRACK_NAME:
          track.name = new TextDecoder().decode(metaData);
          if (DEBUG_MODE.MIDI_IMPORT) {
            console.log(`🏷️  Track name: "${track.name}"`);
          }
          break;

        case MIDI_EVENTS.META_TEMPO:
          if (metaData.length >= 3) {
            const tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
            midiFile.tempo = tempo;
            const bpm = Math.round(60000000 / tempo);
            if (DEBUG_MODE.MIDI_IMPORT) {
              console.log(`🥁 Tempo found: ${tempo} μs/quarter note (${bpm} BPM)`);
            }
          }
          break;

        case MIDI_EVENTS.META_TIME_SIGNATURE:
          if (metaData.length >= 4) {
            const numerator = metaData[0];
            const denominatorPower = metaData[1];
            const denominator = Math.pow(2, denominatorPower);
            midiFile.timeSignature = { numerator, denominator };
            if (DEBUG_MODE.MIDI_IMPORT) {
              console.log(`🎵 Time signature found: ${numerator}/${denominator}`);
            }
          }
          break;

        case MIDI_EVENTS.META_KEY_SIGNATURE:
          if (metaData.length >= 2) {
            const sharpsFlats = metaData[0];
            const majorMinor = metaData[1]; // 0 = major, 1 = minor
            midiFile.keySignature = getKeySignatureFromMidi(sharpsFlats, majorMinor);
            if (DEBUG_MODE.MIDI_IMPORT) {
              const accidentals = sharpsFlats > 127 ? sharpsFlats - 256 : sharpsFlats;
              console.log(`🎼 Key signature found: ${midiFile.keySignature} (${accidentals} ${accidentals >= 0 ? 'sharps' : 'flats'}, ${majorMinor === 0 ? 'major' : 'minor'})`);
            }
          }
          break;

        case MIDI_EVENTS.META_END_OF_TRACK:
          if (DEBUG_MODE.MIDI_IMPORT) {
            console.log('🏁 End of track reached');
          }
          return track;
      }

      continue;
    }

    // System Exclusive events (0xF0/0xF7): skip their payload length
    if (status === 0xF0 || status === 0xF7) {
      const sysexLength = readVLQ(data, offset);
      offset += sysexLength.bytesRead + Math.min(sysexLength.value, data.length - (offset));
      continue;
    }

    const eventType = status & 0xF0;
    const channel = status & 0x0F;
    if (!primaryChannelDetected && eventType >= 0x80 && eventType <= 0xE0) {
      track.channel = channel;
      primaryChannelDetected = true;
    }

    switch (eventType) {
      case MIDI_EVENTS.NOTE_ON: {
        if (offset + 2 > data.length) break;
        const pitch = data[offset];
        const velocity = data[offset + 1];
        offset += 2;

        if (velocity > 0) {
          const noteKey = `${pitch}-${channel}`;
          activeNotes.set(noteKey, { startTick: currentTick, pitch, velocity });
          if (DEBUG_MODE.MIDI_IMPORT) {
            console.log(`🎵 Note ON:  Pitch ${pitch}, Velocity ${velocity}, Tick ${currentTick}, Channel ${channel}`);
          }
        } else {
          // velocity 0 == Note Off
          const noteKey = `${pitch}-${channel}`;
          const activeNote = activeNotes.get(noteKey);
          if (activeNote) {
            const note = {
              startBeat: ticksToBeat(activeNote.startTick, ticksPerQuarter),
              endBeat: ticksToBeat(currentTick, ticksPerQuarter),
              pitch: activeNote.pitch,
              velocity: activeNote.velocity
            };
            track.notes.push(note);
            if (DEBUG_MODE.MIDI_IMPORT) {
              console.log(`🎵 Note OFF (vel=0): Pitch ${pitch}, Duration ${currentTick - activeNote.startTick} ticks`);
            }
            activeNotes.delete(noteKey);
          }
        }
        break;
      }

      case MIDI_EVENTS.NOTE_OFF: {
        if (offset + 2 > data.length) break;
        const offPitch = data[offset];
        // const offVelocity = data[offset + 1]; // unused
        offset += 2;

        const noteKey = `${offPitch}-${channel}`;
        const activeNote = activeNotes.get(noteKey);
        if (activeNote) {
          const note = {
            startBeat: ticksToBeat(activeNote.startTick, ticksPerQuarter),
            endBeat: ticksToBeat(currentTick, ticksPerQuarter),
            pitch: activeNote.pitch,
            velocity: activeNote.velocity
          };
          track.notes.push(note);
          if (DEBUG_MODE.MIDI_IMPORT) {
            console.log(`🎵 Note OFF: Pitch ${offPitch}, Duration ${currentTick - activeNote.startTick} ticks`);
          }
          activeNotes.delete(noteKey);
        }
        break;
      }

      case MIDI_EVENTS.PROGRAM_CHANGE: {
        if (offset + 1 > data.length) break;
        track.program = data[offset];
        if (DEBUG_MODE.MIDI_IMPORT) {
          console.log(`🎸 Program change: Channel ${channel}, Program ${track.program} (GM Instrument)`);
        }
        offset += 1;
        break;
      }

      case MIDI_EVENTS.CONTROL_CHANGE:
      case MIDI_EVENTS.POLY_PRESSURE:
      case MIDI_EVENTS.CHANNEL_PRESSURE: {
        // Skip these events (advance by appropriate number of data bytes)
        const bytesToSkip = (eventType === MIDI_EVENTS.CHANNEL_PRESSURE) ? 1 : 2;
        offset += Math.min(bytesToSkip, data.length - offset);
        break;
      }

      case MIDI_EVENTS.PITCH_BEND: {
        offset += Math.min(2, data.length - offset);
        break;
      }

      default: {
        // Unknown channel event, skip at most 2 data bytes to recover
        offset += Math.min(2, data.length - offset);
        break;
      }
    }
  }
  
  return track;
}

/**
 * Reads a variable-length quantity from MIDI data
 */
function readVLQ(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  let byte;
  
  do {
    if (offset + bytesRead >= data.length) {
      throw new Error('Invalid VLQ: Unexpected end of data');
    }
    
    byte = data[offset + bytesRead];
    bytesRead++;
    
    value = (value << 7) | (byte & 0x7F);
  } while (byte & 0x80);
  
  return { value, bytesRead };
}

/**
 * Reads a 16-bit unsigned integer (big-endian)
 */
function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error('Cannot read Uint16: Not enough data');
  }
  return (data[offset] << 8) | data[offset + 1];
}

/**
 * Reads a 32-bit unsigned integer (big-endian)
 */
function readUint32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('Cannot read Uint32: Not enough data');
  }
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

/**
 * Converts MIDI ticks to beats
 */
function ticksToBeat(ticks: number, ticksPerQuarter: number): number {
  return ticks / ticksPerQuarter;
}

/**
 * Maps MIDI channel and program to KGSP instrument
 */
function getKGInstrumentFromMidi(channel: number, program?: number): InstrumentType {
  // Channel 9 (0-based) is always drums
  if (channel === 9) {
    return 'standard' as InstrumentType;
  }
  
  // Program is 0-127 in MIDI; STANDARD_MIDI_INSTRUMENT_MAP is 1-128
  if (program !== undefined) {
    const gmProgram = Math.max(1, Math.min(128, program + 1));
    const mapping = STANDARD_MIDI_INSTRUMENT_MAP[gmProgram as keyof typeof STANDARD_MIDI_INSTRUMENT_MAP];
    if (mapping) {
      return mapping.fluidR3InstrumentName as InstrumentType;
    }
  }
  
  // Default to acoustic grand piano
  return 'acoustic_grand_piano' as InstrumentType;
}

/**
 * Converts MIDI key signature to KGSP format
 */
function getKeySignatureFromMidi(sharpsFlats: number, majorMinor: number): KeySignature {
  // Handle signed byte
  const accidentals = sharpsFlats > 127 ? sharpsFlats - 256 : sharpsFlats;
  
  if (majorMinor === 0) {
    // Major keys
    switch (accidentals) {
      case 0: return 'C major';
      case 1: return 'G major';
      case 2: return 'D major';
      case 3: return 'A major';
      case 4: return 'E major';
      case 5: return 'B major';
      case 6: return 'F# major';
      case 7: return 'C# major';
      case -1: return 'F major';
      case -2: return 'Bb major';
      case -3: return 'Eb major';
      case -4: return 'Ab major';
      case -5: return 'Db major';
      case -6: return 'Gb major';
      case -7: return 'Cb major';
    }
  } else {
    // Minor keys
    switch (accidentals) {
      case 0: return 'A minor';
      case 1: return 'E minor';
      case 2: return 'B minor';
      case 3: return 'F# minor';
      case 4: return 'C# minor';
      case 5: return 'G# minor';
      case 6: return 'D# minor';
      case 7: return 'A# minor';
      case -1: return 'D minor';
      case -2: return 'G minor';
      case -3: return 'C minor';
      case -4: return 'F minor';
      case -5: return 'Bb minor';
      case -6: return 'Eb minor';
      case -7: return 'Ab minor';
    }
  }
  
  // Default to C major
  return 'C major';
}

/**
 * Groups MIDI notes into regions based on timing
 */
function groupNotesIntoRegions(notes: ParsedMidiNote[], timeSignature: TimeSignature): RegionData[] {
  if (notes.length === 0) return [];
  
  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  
  const regions: RegionData[] = [];
  const beatsPerBar = timeSignature.numerator;
  const regionLengthInBeats = beatsPerBar * 4; // 4 bars per region
  
  // Find the range of all notes
  const firstNoteBeat = Math.floor(sortedNotes[0].startBeat);
  const lastNoteBeat = Math.ceil(Math.max(...sortedNotes.map(n => n.endBeat)));
  
  // Create regions to cover all notes
  for (let regionStart = Math.floor(firstNoteBeat / regionLengthInBeats) * regionLengthInBeats; 
       regionStart < lastNoteBeat; 
       regionStart += regionLengthInBeats) {
    
    const regionEnd = regionStart + regionLengthInBeats;
    
    // Find notes that belong to this region
    const regionNotes = sortedNotes.filter(note => 
      note.startBeat >= regionStart && note.startBeat < regionEnd
    );
    
    if (regionNotes.length > 0) {
      regions.push({
        startBeat: regionStart,
        length: regionLengthInBeats,
        notes: regionNotes
      });
    }
  }
  
  return regions;
}