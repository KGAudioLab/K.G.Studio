import Ajv from 'ajv';
import { ADVANCED_READ_MUSIC_RESPONSE_SCHEMA, ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA } from './advancedReaderResponses';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { GlobalTrackType } from '../../core/global-track';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';
import { createToolInstance } from './index';

const state = { activeRegionId: null as string | null, selectedRegionIds: [] as string[], selectedTrackId: '1' };
vi.mock('../../stores/projectStore', () => ({ useProjectStore: { getState: () => state } }));
let project: KGProject;
let track: KGMidiTrack;
let region: KGMidiRegion;
const ajv = new Ajv({ allErrors: true });
const responseValidators = {
  read_music: ajv.compile(ADVANCED_READ_MUSIC_RESPONSE_SCHEMA),
  read_chord_progression: ajv.compile(ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA),
};
const read = async (name: string, args = {}) => {
  const response = await createToolInstance(name, 'advanced')!.execute(args);
  const validate = responseValidators[name as keyof typeof responseValidators];
  if (validate) expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
  return response;
};

beforeEach(() => {
  vi.restoreAllMocks();
  state.activeRegionId = null;
  state.selectedRegionIds = [];
  project = new KGProject('advanced', 8, 0, 125, { numerator: 4, denominator: 4 }, 'C major');
  track = new KGMidiTrack('Melody', 1);
  region = new KGMidiRegion('region', '1', 0, 'Melody', 0, 7680);
  track.addRegion(region);
  project.setTracks([track]);
  vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project, getSelectedItems: () => [] } as unknown as KGCore);
});

describe('advanced structured readers', () => {
  it('returns the seven-note Twinkle example as an object with metadata', async () => {
    const pitches = [60, 60, 67, 67, 69, 69, 67];
    pitches.forEach((pitch, index) => region.addNote(new KGMidiNote(String(index), index * 960, (index + 1) * 960, pitch, 127)));
    expect(await read('read_music', { track_id: 1, start: 0, length: 7680 })).toEqual({ success: true, result: { tracks: [{
      track_id: 1, track_name: 'Melody', instrument: 'Acoustic Grand Piano',
      time_signature: { numerator: 4, denominator: 4 }, key_signature: 'C', tempo: 125, ticks_per_quarter_note: 960,
      notes: ['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4'].map((pitch, index) => ({ pitch, start: index * 960, length: 960, velocity: 127 })),
    }] } });
  });

  it('preserves polyphony, region offsets, velocity and full durations without rounding', async () => {
    region.setStartTick(1000);
    region.setLengthTicks(100);
    region.addNote(new KGMidiNote('a', 3, 303, 61, 43));
    region.addNote(new KGMidiNote('b', 3, 7, 67, 99));
    const result = await read('read_music', { start: 1004, length: 1 });
    expect(result.result).toMatchObject({ tracks: [{ notes: [
      { pitch: 'C#4', start: 1003, length: 300, velocity: 43 },
      { pitch: 'G4', start: 1003, length: 4, velocity: 99 },
    ] }] });
    expect((await read('read_music', { start: 1007, length: 1 })).result).toMatchObject({ tracks: [{ notes: [{ pitch: 'C#4' }] }] });
  });

  it('flattens multiple regions and returns separate track objects', async () => {
    region.addNote(new KGMidiNote('late', 960, 1920, 60, 90));
    const otherRegion = new KGMidiRegion('other', '1', 0, 'Other', 100, 500);
    otherRegion.addNote(new KGMidiNote('early', 3, 103, 67, 70));
    track.addRegion(otherRegion);
    const bass = new KGMidiTrack('Bass', 2);
    const bassRegion = new KGMidiRegion('bass', '2', 1, 'Bass', 0, 960);
    bassRegion.addNote(new KGMidiNote('bass-note', 0, 960, 36, 100));
    bass.addRegion(bassRegion);
    project.setTracks([track, bass]);
    expect((await read('read_music')).result).toMatchObject({ tracks: [
      { track_id: 1, notes: [{ pitch: 'G4', start: 103 }, { pitch: 'C4', start: 960 }] },
      { track_id: 2, notes: [{ pitch: 'C2', start: 0 }] },
    ] });
  });

  it('includes empty tracks and returns empty arrays for empty ranges/projects', async () => {
    project.setTracks([track, new KGMidiTrack('Empty', 2)]);
    expect((await read('read_music')).result).toMatchObject({ tracks: [{ notes: [] }, { track_id: 2, notes: [] }] });
    expect((await read('read_music', { track_id: 2 })).result).toMatchObject({ tracks: [{ track_id: 2, notes: [] }] });
    expect((await read('read_music', { track_id: 99 })).success).toBe(false);
    project.setTracks([]);
    expect(await read('read_music')).toEqual({ success: true, result: { tracks: [] } });
  });

  it.each([{ start: -1 }, { start: 0.5 }, { length: 0 }, { length: 1.5 }, { start: NaN }, { length: Infinity }])('rejects invalid ticks %j', async args => {
    expect((await read('read_music', args)).success).toBe(false);
  });

  it('uses effective metadata at the exact start', async () => {
    const tempo = findGlobalTrackByType(project, GlobalTrackType.Tempo)!;
    tempo.addRegion(new KGTempoRegion('tempo', tempo.getId(), tempo.getTrackIndex(), 90, 1, 1));
    const key = findGlobalTrackByType(project, GlobalTrackType.Signature)!;
    key.addRegion(new KGKeySignatureRegion('key', key.getId(), key.getTrackIndex(), 'A minor', 1, 1));
    expect((await read('read_music', { start: 4000, length: 1 })).result).toMatchObject({ tracks: [{ tempo: 90, key_signature: 'Am' }] });
    expect((await read('read_bpm')).result).toMatchObject({ bpms: [{ start: 3840, bpm: 90 }] });
    expect((await read('read_key_signature')).result).toMatchObject({ key_signatures: [{ start: 3840, key_signature: 'Am' }] });
  });

  it('reads full overlapping chord symbols in selected-region and song scopes', async () => {
    const chords = findGlobalTrackByType(project, GlobalTrackType.Chord)!;
    chords.addRegion(new KGChordRegion('c', chords.getId(), chords.getTrackIndex(), 'Dm', 960, 1920));
    chords.addRegion(new KGChordRegion('d', chords.getId(), chords.getTrackIndex(), 'G7', 4000, 100));
    region.setStartTick(1500);
    region.setLengthTicks(100);
    state.activeRegionId = region.getId();
    expect((await read('read_chord_progression')).result).toMatchObject({ track_id: chords.getId(), chords: [{ chord: 'Dm', start: 960, length: 1920 }] });
    state.activeRegionId = null;
    expect((await read('read_chord_progression')).result).toMatchObject({ chords: [{ chord: 'Dm' }, { chord: 'G7' }] });
    chords.setRegions([]);
    expect((await read('read_chord_progression')).result).toMatchObject({ chords: [] });
    vi.spyOn(project, 'getGlobalTracks').mockReturnValue([]);
    expect((await read('read_chord_progression')).result).toEqual({ msg: 'No chord progression has been defined for this project.' });
  });

  it('returns a schema-conforming chord error when project access fails', async () => {
    vi.spyOn(project, 'getGlobalTracks').mockImplementation(() => { throw new Error('Project unavailable'); });
    const response = await read('read_chord_progression');
    expect(response.success).toBe(false);
    expect(response.result).toContain('Project unavailable');
  });

  it('returns defaults, markers, and selected range as tick JSON', async () => {
    expect((await read('read_bpm')).result).toEqual({ ticks_per_quarter_note: 960, bpms: [{ start: 0, bpm: 125 }] });
    expect((await read('read_key_signature')).result).toEqual({ ticks_per_quarter_note: 960, key_signatures: [{ start: 0, key_signature: 'C' }] });
    expect((await read('read_markers')).result).toEqual({ ticks_per_quarter_note: 960, markers: [] });
    const markers = findGlobalTrackByType(project, GlobalTrackType.Marker)!;
    markers.addRegion(new KGMarkerRegion('marker', markers.getId(), markers.getTrackIndex(), 'Verse', 123, 456));
    expect((await read('read_markers')).result).toMatchObject({ markers: [{ start: 123, length: 456, name: 'Verse' }] });
    expect((await read('get_user_selected_music_range_and_track')).result).toEqual({ ticks_per_quarter_note: 960, range: null, track: null });
    state.selectedRegionIds = [region.getId()];
    expect((await read('get_user_selected_music_range_and_track')).result).toMatchObject({ range: { start: 0, end: 7680 }, track: { track_id: '1', track_name: 'Melody' } });
  });
});
