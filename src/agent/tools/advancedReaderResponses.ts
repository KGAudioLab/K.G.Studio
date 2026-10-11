import { FLUIDR3_INSTRUMENT_MAP, INSTRUMENT_GROUPS } from '../../constants/generalMidiConstants';

/** Documentation contracts only. Validation lives in tests, never in tool execution. */
type ResponseSchema = Record<string, unknown>;

function object(properties: Record<string, ResponseSchema>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const metadataProperties = {
  time_signature: { $ref: '#/definitions/timeSignature' },
  key_signature: { type: 'string', description: 'Effective key at the read range start, such as C or Am.' },
  tempo: { type: 'number', description: 'Effective tempo in BPM at the read range start.' },
  ticks_per_quarter_note: { const: 960 },
};

const definitions = {
  timeSignature: object({ numerator: { type: 'integer' }, denominator: { type: 'integer' } }),
  start: { type: 'integer', description: 'Absolute timeline position in ticks; overlapping events can start before the read range.' },
  length: { type: 'integer', description: 'Full stored event duration in ticks, without clipping to the read range.' },
};

function responseSchema(result: ResponseSchema) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    definitions,
    oneOf: [
      object({ success: { const: true }, result }),
      object({ success: { const: false }, result: { type: 'string', description: 'Tool error message.' } }),
    ],
  };
}

export const ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_SCHEMA = responseSchema(object({
  groups: { type: 'array', description: 'Instrument families in catalog order, including empty groups and enabled custom instruments.', items: object({
    group_name: { type: 'string', description: 'English instrument family name.' },
    instruments: { type: 'array', items: { type: 'string' }, description: 'Exact instrument names accepted by create_new_track and update_track, in catalog order.' },
  }) },
}));

// Complete built-in catalog example; runtime custom instruments are read by the tool.
export const ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE = {
  success: true,
  result: {
    groups: [
      ...Object.entries(INSTRUMENT_GROUPS).map(([key, group_name]) => ({
        group_name,
        instruments: Object.values(FLUIDR3_INSTRUMENT_MAP)
          .filter(instrument => instrument.group === key)
          .map(instrument => instrument.displayName),
      })),
      { group_name: 'Custom Instruments', instruments: [] as string[] },
    ],
  },
};

export const ADVANCED_LIST_ALL_TRACKS_RESPONSE_SCHEMA = responseSchema(object({
  tracks: { type: 'array', description: 'MIDI tracks in project order. Empty when no MIDI tracks exist.', items: object({
    track_id: { type: 'integer' },
    track_name: { type: 'string' },
    instrument: { type: 'string', description: 'English instrument display name, or the stored key if unknown.' },
    volume: { type: 'number', description: 'Stored mixer volume in dB, without evaluating automation.' },
    pan: { type: 'number', minimum: -1, maximum: 1, description: 'Stored mixer pan: -1 left, 0 center, 1 right. Automation is not evaluated.' },
    status: object({
      mute: { type: 'boolean', description: 'Explicit track mute flag.' },
      solo: { type: 'boolean', description: 'Explicit track solo flag.' },
    }),
  }) },
}));

export const ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE = {
  success: true,
  result: {
    tracks: [
      { track_id: 1, track_name: 'Melody', instrument: 'Acoustic Grand Piano', volume: 0, pan: 0, status: { mute: false, solo: false } },
      { track_id: 2, track_name: 'Accompaniment', instrument: 'Acoustic Grand Piano', volume: -3, pan: 0.2, status: { mute: false, solo: false } },
    ],
  },
};

export const ADVANCED_READ_MUSIC_RESPONSE_SCHEMA = responseSchema(object({
  tracks: { type: 'array', description: 'One entry per MIDI track, even for a single-track read. Empty when no MIDI tracks exist.', items: object({
    track_id: { type: 'integer' },
    track_name: { type: 'string' },
    instrument: { type: 'string' },
    ...metadataProperties,
    notes: { type: 'array', description: 'Stored notes in chronological order. Empty for silent tracks or ranges; rests are implicit.', items: object({
      pitch: { type: 'string', description: 'Stored MIDI pitch as sharp-based scientific notation, such as C4 or C#4.' },
      start: { $ref: '#/definitions/start' },
      length: { $ref: '#/definitions/length' },
      velocity: { type: 'integer' },
    }) },
  }) },
}));

export const ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA = responseSchema({
  oneOf: [
    object({
      track_id: { type: 'string' },
      track_name: { type: 'string' },
      ...metadataProperties,
      chords: { type: 'array', description: 'Full overlapping chord annotations in chronological order; empty when none exist in the read range.', items: object({
        chord: { type: 'string', description: 'Chord symbol, such as C or Dm. This is a reference annotation, not an audible MIDI note.' },
        start: { $ref: '#/definitions/start' },
        length: { $ref: '#/definitions/length' },
      }) },
    }),
    object({ msg: { const: 'No chord progression has been defined for this project.' } }),
  ],
});

export const ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE = {
  success: true,
  result: {
    tracks: [{
      track_id: 1,
      track_name: 'Melody',
      instrument: 'Acoustic Grand Piano',
      time_signature: { numerator: 4, denominator: 4 },
      key_signature: 'C',
      tempo: 125,
      ticks_per_quarter_note: 960,
      notes: [
        { pitch: 'C4', start: 0, length: 960, velocity: 127 },
        { pitch: 'G4', start: 960, length: 960, velocity: 100 },
      ],
    }],
  },
};

export const ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE = {
  success: true,
  result: {
    track_id: 'global-chord',
    track_name: 'Chords',
    time_signature: { numerator: 4, denominator: 4 },
    key_signature: 'C',
    tempo: 125,
    ticks_per_quarter_note: 960,
    chords: [
      { chord: 'C', start: 0, length: 3840 },
      { chord: 'Dm', start: 3840, length: 3840 },
    ],
  },
};

export function describeReaderResponse(description: string, schema: ResponseSchema, example: unknown): string {
  return `${description}\n\nResponse schema (JSON Schema Draft 7; complete {success,result} envelope):\n${JSON.stringify(schema)}\n\nExample response:\n${JSON.stringify(example)}`;
}
