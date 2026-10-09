import Ajv from 'ajv';
import { describe, expect, it, vi } from 'vitest';
import {
  ADVANCED_READ_MUSIC_RESPONSE_SCHEMA,
  ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE,
  ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA,
  ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE,
} from './advancedReaderResponses';
import { createToolInstance } from './index';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: { getState: () => ({}) },
}));

const ajv = new Ajv({ allErrors: true });
const contracts = [
  ['read_music', ADVANCED_READ_MUSIC_RESPONSE_SCHEMA, ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE],
  ['read_chord_progression', ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA, ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE],
] as const;

describe('advanced reader response documentation', () => {
  it.each(contracts)('publishes a valid Draft 7 schema and conforming example for %s', (name, schema, example) => {
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(ajv.validateSchema(schema)).toBe(true);
    const validate = ajv.compile(schema);
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true);
    const description = createToolInstance(name, 'advanced')!.getDefinition().function.description;
    const [schemaText, exampleText] = description.split('Response schema (JSON Schema Draft 7; complete {success,result} envelope):\n')[1].split('\n\nExample response:\n');
    expect(JSON.parse(schemaText)).toEqual(schema);
    expect(JSON.parse(exampleText)).toEqual(example);
  });

  it.each(contracts)('documents errors and rejects string-encoded results for %s', (_name, schema, example) => {
    const validate = ajv.compile(schema);
    expect(validate({ success: false, result: 'Failed to read project.' })).toBe(true);
    expect(validate({ success: true, result: JSON.stringify(example.result) })).toBe(false);
    expect(validate({ success: true, result: {} })).toBe(false);
    expect(validate({ success: false, result: example.result })).toBe(false);
  });

  it('supports empty music output and silent tracks while rejecting incorrect ID/timing types', () => {
    const validate = ajv.compile(ADVANCED_READ_MUSIC_RESPONSE_SCHEMA);
    expect(validate({ success: true, result: { tracks: [] } })).toBe(true);
    const silent = structuredClone(ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE);
    silent.result.tracks[0].notes = [];
    expect(validate(silent)).toBe(true);
    const wrongId = { success: true, result: { tracks: [{ ...silent.result.tracks[0], track_id: '1' }] } };
    expect(validate(wrongId)).toBe(false);
    const fractional = structuredClone(ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE);
    fractional.result.tracks[0].notes[0].start = 0.5;
    expect(validate(fractional)).toBe(false);
    const wrongResolution = structuredClone(ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE);
    wrongResolution.result.tracks[0].ticks_per_quarter_note = 480;
    expect(validate(wrongResolution)).toBe(false);
  });

  it('supports empty chord output and missing-track messages while rejecting note fields', () => {
    const validate = ajv.compile(ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA);
    const empty = structuredClone(ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE);
    empty.result.chords = [];
    expect(validate(empty)).toBe(true);
    expect(validate({ success: true, result: { msg: 'No chord progression has been defined for this project.' } })).toBe(true);
    expect(validate({ success: true, result: { ...empty.result, track_id: 1 } })).toBe(false);
    expect(validate({ success: true, result: { ...empty.result, chords: [{ pitch: 'C4', start: 0, length: 960 }] } })).toBe(false);
  });

  it.each(['read_music', 'read_chord_progression'])('leaves %s inputs and regular/efficient definitions unchanged', name => {
    const regular = createToolInstance(name, 'regular')!.getDefinition();
    const efficient = createToolInstance(name, 'efficient')!.getDefinition();
    expect(efficient).toEqual(regular);
    expect(regular.function.description).not.toContain('Response schema');
    expect(regular.function.description).not.toContain('Example response');
    const advanced = createToolInstance(name, 'advanced')!.getDefinition();
    expect(advanced.function.name).toBe(name);
    expect(advanced.function.parameters.required).toBeUndefined();
    if (name === 'read_music') {
      expect(advanced.function.parameters.properties).toEqual({
        track_id: { type: 'string', description: 'Track ID, or "all". Omitted reads all MIDI tracks.' },
        start: { type: 'number', description: 'Nonnegative integer absolute timeline tick. Defaults to 0.' },
        length: { type: 'number', description: 'Positive integer duration in ticks. Omitted reads to each track end.' },
      });
    } else expect(advanced.function.parameters.properties).toEqual({});
  });
});
