import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadMusicTool } from './ReadMusicTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';

function buildTrack(name: string, id: number, regionStartBeat: number, regionLength: number): KGMidiTrack {
  const track = new KGMidiTrack(name, id);
  const region = new KGMidiRegion(`region-${id}`, track.getId().toString(), track.getTrackIndex(), `${name} Region`, regionStartBeat, regionLength);
  region.addNote(new KGMidiNote(`note-${id}`, 0, 4, 60));
  track.setRegions([region]);
  return track;
}

describe('ReadMusicTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a compact summary for a single track read', () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 16);
    project.setTracks([leadTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const summary = tool.buildToolResultDisplayContent(
      {
        track_id: leadTrack.getId().toString(),
        start: 5,
        length: 6,
      },
      { success: true, result: 'raw result' },
    );

    expect(summary).toBe('Read track Lead from bars 2 to 3.');
  });

  it('builds a compact summary for reading multiple tracks', () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 16);
    const bassTrack = buildTrack('Bass', 2, 0, 12);
    project.setTracks([leadTrack, bassTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const summary = tool.buildToolResultDisplayContent(
      {
        track_id: 'all',
        start: 0,
        length: 16,
      },
      { success: true, result: 'raw result' },
    );

    expect(summary).toBe('Read tracks Lead and Bass from bars 1 to 4.');
  });

  it('returns no compact summary when the requested track cannot be resolved', () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([buildTrack('Lead', 1, 0, 16)]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const summary = tool.buildToolResultDisplayContent(
      {
        track_id: 'missing-track',
        start: 0,
        length: 4,
      },
      { success: true, result: 'raw result' },
    );

    expect(summary).toBeUndefined();
  });

  it('returns a professional empty-project message when all MIDI tracks are empty', async () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const emptyTrack = new KGMidiTrack('Lead', 1);
    emptyTrack.setRegions([
      new KGMidiRegion('region-1', emptyTrack.getId().toString(), emptyTrack.getTrackIndex(), 'Lead Region', 0, 36),
    ]);
    project.setTracks([emptyTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 'all', start: 0, length: 36 });

    expect(result.success).toBe(true);
    expect(result.result).toBe('No musical content is present in the project yet.');
  });

  it('returns a professional empty-range message when the selected range has no MIDI notes', async () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 8);
    project.setTracks([leadTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 'all', start: 16, length: 8 });

    expect(result.success).toBe(true);
    expect(result.result).toBe('No musical content was found in the selected range.');
  });
});
