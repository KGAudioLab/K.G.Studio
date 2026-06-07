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

  it('builds a compact summary for reading multiple tracks including empty ones', () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 16);
    const emptyTrack = new KGMidiTrack('Pads', 2);
    project.setTracks([leadTrack, emptyTrack]);

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

    expect(summary).toBe('Read tracks Lead and Pads from bars 1 to 4.');
  });

  it('includes empty MIDI tracks as rest-only ABC sections in all-track reads', async () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 8);
    const emptyTrack = new KGMidiTrack('Pads', 2);
    project.setTracks([leadTrack, emptyTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 'all', start: 0, length: 8 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('track_id: 1');
    expect(result.result).toContain('track_name: Lead');
    expect(result.result).toContain('Instrument: Acoustic Grand Piano');
    expect(result.result).toContain('track_id: 2');
    expect(result.result).toContain('track_name: Pads');
    expect(result.result).toContain('Instrument: Acoustic Grand Piano');
    expect(result.result).not.toContain('Track 1 - Melody:');
    expect(result.result).not.toContain('Track 2 - Pads:');
    expect(result.result).not.toContain('\nT:');
    expect(result.result).toContain('z4 | z4 | // No regions found');
  });

  it('reads a specific track when track_id is provided as a number', async () => {
    const project = new KGProject('read-music-numeric-track-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 8);
    const bassTrack = buildTrack('Bass', 2, 0, 8);
    project.setTracks([leadTrack, bassTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 2, start: 0, length: 8 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('track_id: 2');
    expect(result.result).toContain('track_name: Bass');
    expect(result.result).not.toContain('track_id: 1');
    expect(tool.buildToolResultDisplayContent(
      { track_id: 2, start: 0, length: 8 },
      { success: true, result: 'raw result' },
    )).toBe('Read track Bass from bars 1 to 2.');
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

  it('preserves the all-tracks behavior when track_id is "all"', async () => {
    const project = new KGProject('read-music-all-track-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 8);
    const bassTrack = buildTrack('Bass', 2, 0, 8);
    project.setTracks([leadTrack, bassTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 'all', start: 0, length: 8 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('track_id: 1');
    expect(result.result).toContain('track_id: 2');
  });

  it('returns a professional empty-range message when the selected range has no MIDI notes', async () => {
    const project = new KGProject('read-music-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const leadTrack = buildTrack('Lead', 1, 0, 8);
    const emptyTrack = new KGMidiTrack('Pads', 2);
    project.setTracks([leadTrack, emptyTrack]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
    } as unknown as KGCore);

    const tool = new ReadMusicTool();
    const result = await tool.execute({ track_id: 'all', start: 16, length: 8 });

    expect(result.success).toBe(true);
    expect(result.result).toBe('No musical content was found in the selected range.');
  });
});
