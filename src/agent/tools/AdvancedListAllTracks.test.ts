import Ajv from 'ajv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvancedListAllTracks } from './AdvancedListAllTracks';
import { ListAllTracksTool } from './ListAllTracksTool';
import { createToolInstance } from './index';
import { ADVANCED_LIST_ALL_TRACKS_RESPONSE_SCHEMA } from './advancedReaderResponses';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: { getState: () => ({}) },
}));

const validate = new Ajv({ allErrors: true }).compile(ADVANCED_LIST_ALL_TRACKS_RESPONSE_SCHEMA);

function mockProject(tracks: Array<KGMidiTrack | KGAudioTrack>) {
  const project = new KGProject('track-list-project');
  project.setTracks(tracks);
  vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as unknown as KGCore);
}

describe('AdvancedListAllTracks', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns schema-conforming MIDI tracks in project order with stored mixer settings', async () => {
    const melody = new KGMidiTrack('Melody', 8, 'acoustic_grand_piano');
    const bass = new KGMidiTrack('Bass', 2, 'electric_bass_finger');
    melody.setVolume(-3);
    melody.setPan(0.2);
    melody.setMuted(true);
    bass.setVolume(-6);
    bass.setPan(-1);
    bass.setSolo(true);
    // Automation reads must not replace the stored mixer settings.
    vi.spyOn(melody, 'getVolumeAutomation').mockImplementation(() => { throw new Error('Unexpected automation read'); });
    vi.spyOn(melody, 'getPanAutomation').mockImplementation(() => { throw new Error('Unexpected automation read'); });
    mockProject([melody, new KGAudioTrack('Vocal', 3), bass]);

    const tool = new AdvancedListAllTracks();
    const response = await tool.execute({});
    expect(response).toEqual({ success: true, result: { tracks: [
      { track_id: 8, track_name: 'Melody', instrument: 'Acoustic Grand Piano', volume: -3, pan: 0.2, status: { mute: true, solo: false } },
      { track_id: 2, track_name: 'Bass', instrument: 'Electric Bass (finger)', volume: -6, pan: -1, status: { mute: false, solo: true } },
    ] } });
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    expect(tool.buildToolResultDisplayContent(null, response)).toBeUndefined();
    expect(tool.buildToolHistoryContent(null, response)).toBeUndefined();
  });

  it.each([false, true])('returns an empty array with audio-only=%s', async audioOnly => {
    mockProject(audioOnly ? [new KGAudioTrack('Mixdown', 1)] : []);
    const response = await new AdvancedListAllTracks().execute({});
    expect(response).toEqual({ success: true, result: { tracks: [] } });
    expect(validate(response)).toBe(true);
  });

  it('preserves name and unknown-instrument fallbacks', async () => {
    const track = new KGMidiTrack('', 5);
    mockProject([track]);
    track.setTrackIndex(3);
    vi.spyOn(track, 'getInstrument').mockReturnValue('unknown_instrument' as ReturnType<KGMidiTrack['getInstrument']>);
    const response = await new AdvancedListAllTracks().execute({});
    expect(response.result).toMatchObject({ tracks: [{ track_id: 5, track_name: 'Track 4', instrument: 'unknown_instrument' }] });
    expect(validate(response)).toBe(true);
  });

  it('preserves string errors', async () => {
    vi.spyOn(KGCore, 'instance').mockImplementation(() => { throw new Error('Project unavailable'); });
    const response = await new AdvancedListAllTracks().execute({});
    expect(response).toEqual({ success: false, result: 'Failed to list tracks: Error: Project unavailable' });
    expect(validate(response)).toBe(true);
  });

  it('registers the replacement only in Advanced mode and preserves legacy outputs', async () => {
    const advanced = createToolInstance('list_all_tracks', 'advanced')!;
    expect(advanced).toBeInstanceOf(AdvancedListAllTracks);
    expect(advanced.isAvailableInAdvancedMode()).toBe(true);
    expect(advanced.isAvailableInRegularMode()).toBe(false);
    expect(advanced.isAvailableInEfficientMode()).toBe(false);
    expect(advanced.getDefinition().function.parameters).toEqual({ type: 'object', properties: {} });
    mockProject([new KGMidiTrack('Melody', 1)]);
    for (const mode of ['regular', 'efficient'] as const) {
      const legacy = createToolInstance('list_all_tracks', mode)!;
      expect(legacy).toBeInstanceOf(ListAllTracksTool);
      expect(legacy.getDefinition()).toEqual(new ListAllTracksTool().getDefinition());
      expect(await legacy.execute({})).toEqual({ success: true, result: 'track_id: 1\ntrack_name: Melody\ninstrument: Acoustic Grand Piano' });
      mockProject([]);
      expect(await legacy.execute({})).toEqual({ success: true, result: 'No MIDI tracks found.' });
      mockProject([new KGMidiTrack('Melody', 1)]);
    }
  });
});
