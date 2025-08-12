/**
 * MIDI file format constants for Standard MIDI File conversion
 */

// MIDI file header constants
export const MIDI_HEADER = {
  // Header chunk identifier
  CHUNK_TYPE: new Uint8Array([0x4D, 0x54, 0x68, 0x64]), // "MThd"
  
  // Header chunk size (always 6 bytes)
  HEADER_SIZE: new Uint8Array([0x00, 0x00, 0x00, 0x06]),
  
  // MIDI file formats
  FORMAT_0: new Uint8Array([0x00, 0x00]), // Single track
  FORMAT_1: new Uint8Array([0x00, 0x01]), // Multi-track, synchronous
  FORMAT_2: new Uint8Array([0x00, 0x02]), // Multi-track, asynchronous
};

// Track chunk constants
export const MIDI_TRACK = {
  // Track chunk identifier
  CHUNK_TYPE: new Uint8Array([0x4D, 0x54, 0x72, 0x6B]), // "MTrk"
  
  // End of track meta event
  END_OF_TRACK: new Uint8Array([0x00, 0xFF, 0x2F, 0x00]),
};

// Timing constants
export const MIDI_TIMING = {
  // Ticks Per Quarter Note (TPQN) - 480 provides good resolution
  TPQN: 480,
  TPQN_BYTES: new Uint8Array([0x01, 0xE0]), // 480 in big-endian 16-bit
};

// MIDI event types
export const MIDI_EVENTS = {
  // Channel voice messages (status bytes)
  NOTE_OFF: 0x80,
  NOTE_ON: 0x90,
  POLY_PRESSURE: 0xA0,
  CONTROL_CHANGE: 0xB0,
  PROGRAM_CHANGE: 0xC0,
  CHANNEL_PRESSURE: 0xD0,
  PITCH_BEND: 0xE0,
  
  // System exclusive
  SYSEX: 0xF0,
  
  // Meta events
  META_EVENT: 0xFF,
  META_SEQUENCE_NUMBER: 0x00,
  META_TEXT: 0x01,
  META_COPYRIGHT: 0x02,
  META_TRACK_NAME: 0x03,
  META_INSTRUMENT_NAME: 0x04,
  META_LYRIC: 0x05,
  META_MARKER: 0x06,
  META_CUE_POINT: 0x07,
  META_CHANNEL_PREFIX: 0x20,
  META_END_OF_TRACK: 0x2F,
  META_TEMPO: 0x51,
  META_SMPTE_OFFSET: 0x54,
  META_TIME_SIGNATURE: 0x58,
  META_KEY_SIGNATURE: 0x59,
  META_SEQUENCER_SPECIFIC: 0x7F,
};

// MIDI channels (0-based)
export const MIDI_CHANNELS = {
  PIANO: 0,
  GUITAR: 1,
  BASS: 2,
  DRUMS: 9, // Channel 10 (0-based = 9) is reserved for percussion
};

// General MIDI instrument program numbers (0-based)
export const GM_INSTRUMENTS = {
  PIANO: 0,        // Acoustic Grand Piano
  GUITAR: 24,      // Acoustic Guitar (nylon)
  BASS: 32,        // Acoustic Bass
  DRUMS: 0,        // Not used for drums (uses channel 10)
};

// MIDI velocity constants
export const MIDI_VELOCITY = {
  MIN: 1,
  MAX: 127,
  DEFAULT: 64,
};

// MIDI note constants
export const MIDI_NOTES = {
  MIN: 0,
  MAX: 127,
  MIDDLE_C: 60, // C4
};

// Time signature constants
export const MIDI_TIME_SIGNATURE = {
  // Denominator values for MIDI (power of 2)
  DENOMINATOR_MAP: {
    2: 1,   // 2 = 2^1
    4: 2,   // 4 = 2^2
    8: 3,   // 8 = 2^3
    16: 4,  // 16 = 2^4
  } as const,
  
  // Default values
  DEFAULT_METRONOME_PULSE: 24,  // MIDI clocks per quarter note
  DEFAULT_32ND_NOTES_PER_QUARTER: 8,
};

// Key signature constants (for MIDI key signature meta event)
export const MIDI_KEY_SIGNATURE = {
  // Sharp keys (positive values)
  SHARP_KEYS: {
    'C major': 0,
    'G major': 1,
    'D major': 2,
    'A major': 3,
    'E major': 4,
    'B major': 5,
    'F# major': 6,
    'C# major': 7,
  },
  
  // Flat keys (negative values)
  FLAT_KEYS: {
    'F major': -1,
    'Bb major': -2,
    'Eb major': -3,
    'Ab major': -4,
    'Db major': -5,
    'Gb major': -6,
    'Cb major': -7,
  },
  
  // Minor keys
  MINOR_KEYS: {
    'A minor': 0,
    'E minor': 1,
    'B minor': 2,
    'F# minor': 3,
    'C# minor': 4,
    'G# minor': 5,
    'D# minor': 6,
    'A# minor': 7,
    'D minor': -1,
    'G minor': -2,
    'C minor': -3,
    'F minor': -4,
    'Bb minor': -5,
    'Eb minor': -6,
    'Ab minor': -7,
  },
} as const;

// Utility functions for MIDI data conversion
export const MIDI_UTILS = {
  /**
   * Convert a 32-bit integer to big-endian byte array
   */
  int32ToBytes: (value: number): Uint8Array => {
    return new Uint8Array([
      (value >> 24) & 0xFF,
      (value >> 16) & 0xFF,
      (value >> 8) & 0xFF,
      value & 0xFF,
    ]);
  },
  
  /**
   * Convert a 16-bit integer to big-endian byte array
   */
  int16ToBytes: (value: number): Uint8Array => {
    return new Uint8Array([
      (value >> 8) & 0xFF,
      value & 0xFF,
    ]);
  },
  
  /**
   * Convert a variable-length quantity (VLQ) to bytes
   * Used for MIDI delta times
   */
  encodeVLQ: (value: number): Uint8Array => {
    const bytes: number[] = [];
    
    // Handle zero case
    if (value === 0) {
      return new Uint8Array([0]);
    }
    
    // Convert to VLQ format
    let temp = value & 0x7F;
    while ((value >>= 7) > 0) {
      temp <<= 8;
      temp |= ((value & 0x7F) | 0x80);
    }
    
    // Extract bytes
    while (true) {
      bytes.push(temp & 0xFF);
      if (temp & 0x80) {
        temp >>= 8;
      } else {
        break;
      }
    }
    
    return new Uint8Array(bytes);
  },
  
  /**
   * Calculate microseconds per quarter note from BPM
   */
  bpmToMicrosecondsPerQuarter: (bpm: number): number => {
    return Math.round(60000000 / bpm);
  },
};