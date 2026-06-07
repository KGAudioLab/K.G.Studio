import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddNotesTool } from './AddNotesTool';
import {
  NO_MIDI_TARGET_HISTORY_MESSAGE,
  NO_MIDI_TARGET_RAW_MESSAGE,
  NO_MIDI_TARGET_UI_MESSAGE,
} from './toolTargeting';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';

const storeState = {
  activeRegionId: null as string | null,
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

function mockCore(project: KGProject, selectedItems: unknown[] = []) {
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project,
    getSelectedItems: () => selectedItems,
    executeCommand: (command: { execute(): void }) => command.execute(),
  } as unknown as KGCore);
}

describe('AddNotesTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    vi.restoreAllMocks();
  });

  it('builds summaries for an active MIDI region target', () => {
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region-1', track.getId().toString(), track.getTrackIndex(), 'Verse Melody', 0, 32);
    track.setRegions([region]);
    const project = new KGProject('summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    storeState.activeRegionId = region.getId();
    mockCore(project);

    const tool = new AddNotesTool();
    const args = {
      notes: [
        { pitch: 'C4', start: 16, length: 4 },
        { pitch: 'E4', start: 20, length: 8 },
      ],
    };

    expect(tool.buildToolResultDisplayContent(args, { success: true, result: 'raw result' })).toBe(
      'Successfully created 2 notes in region **Verse Melody** on track **Lead**, spanning bars 5 to 7.',
    );
    expect(tool.buildConfirmationContent(args)).toBe(
      'Allow creating 2 notes on track **Lead** in region **Verse Melody**, spanning bars 5 to 7?',
    );
  });

  it('creates a new MIDI region on the requested track when no region overlaps', async () => {
    const track = new KGMidiTrack('Lead', 1);
    const existingRegion = new KGMidiRegion('region-1', track.getId().toString(), track.getTrackIndex(), 'Intro', 0, 4);
    track.setRegions([existingRegion]);
    const project = new KGProject('create-region-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_id: track.getId().toString(),
      notes: [
        { pitch: 'C4', start: 16, length: 2 },
        { pitch: 'E4', start: 18, length: 2 },
      ],
    });

    expect(result.success).toBe(true);
    expect(track.getRegions()).toHaveLength(2);
    const createdRegion = track.getRegions()[1] as KGMidiRegion;
    expect(createdRegion.getName()).toBe('Lead Region');
    expect(createdRegion.getStartFromBeat()).toBe(16);
    expect(createdRegion.getLength()).toBe(4);
    expect(createdRegion.getNotes()).toHaveLength(2);
    expect(createdRegion.getNotes().map(note => note.getStartBeat())).toEqual([0, 2]);
  });

  it('accepts a numeric track_id and creates notes on the matching track', async () => {
    const track = new KGMidiTrack('Lead', 1);
    const project = new KGProject('numeric-track-id-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_id: track.getId(),
      notes: [{ pitch: 'C4', start: 8, length: 2 }],
    });

    expect(result.success).toBe(true);
    expect(track.getRegions()).toHaveLength(1);
    const createdRegion = track.getRegions()[0] as KGMidiRegion;
    expect(createdRegion.getName()).toBe('Lead Region');
    expect(createdRegion.getNotes()).toHaveLength(1);
    expect(createdRegion.getNotes()[0].getStartBeat()).toBe(0);
  });

  it('targets a track by track_name when track_id is omitted', async () => {
    const targetTrack = new KGMidiTrack('Lead', 1);
    const otherTrack = new KGMidiTrack('Bass', 2);
    targetTrack.setRegions([new KGMidiRegion('region-1', targetTrack.getId().toString(), targetTrack.getTrackIndex(), 'Intro', 0, 4)]);
    const project = new KGProject('track-name-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([targetTrack, otherTrack]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_name: 'Lead',
      notes: [{ pitch: 'C4', start: 16, length: 2 }],
    });

    expect(result.success).toBe(true);
    expect(targetTrack.getRegions()).toHaveLength(2);
    expect(otherTrack.getRegions()).toHaveLength(0);
  });

  it('uses track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1);
    const bassTrack = new KGMidiTrack('Bass', 2);
    const project = new KGProject('track-id-precedence-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_id: bassTrack.getId().toString(),
      track_name: 'Lead',
      notes: [{ pitch: 'C4', start: 8, length: 2 }],
    });

    expect(result.success).toBe(true);
    expect(leadTrack.getRegions()).toHaveLength(0);
    expect(bassTrack.getRegions()).toHaveLength(1);
    expect((bassTrack.getRegions()[0] as KGMidiRegion).getName()).toBe('Bass Region');
  });

  it('uses a numeric track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1);
    const bassTrack = new KGMidiTrack('Bass', 2);
    const project = new KGProject('numeric-track-id-precedence-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_id: bassTrack.getId(),
      track_name: 'Lead',
      notes: [{ pitch: 'C4', start: 8, length: 2 }],
    });

    expect(result.success).toBe(true);
    expect(leadTrack.getRegions()).toHaveLength(0);
    expect(bassTrack.getRegions()).toHaveLength(1);
    expect((bassTrack.getRegions()[0] as KGMidiRegion).getName()).toBe('Bass Region');
  });

  it('uses the first matching track when duplicate track names exist', async () => {
    const firstLead = new KGMidiTrack('Lead', 1);
    const secondLead = new KGMidiTrack('Lead', 2);
    const project = new KGProject('duplicate-track-name-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([firstLead, secondLead]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_name: 'Lead',
      notes: [{ pitch: 'C4', start: 4, length: 2 }],
    });

    expect(result.success).toBe(true);
    expect(firstLead.getRegions()).toHaveLength(1);
    expect(secondLead.getRegions()).toHaveLength(0);
  });

  it('chooses the largest overlapping region and auto-expands it to fit the notes', async () => {
    const track = new KGMidiTrack('Lead', 1);
    const regionA = new KGMidiRegion('region-a', track.getId().toString(), track.getTrackIndex(), 'Region A', 0, 4);
    const regionB = new KGMidiRegion('region-b', track.getId().toString(), track.getTrackIndex(), 'Region B', 4, 4);
    regionB.setNotes([new KGMidiNote('note-existing', 0, 1, 60, 100)]);
    track.setRegions([regionA, regionB]);
    const project = new KGProject('expand-region-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new AddNotesTool();
    const result = await tool.execute({
      track_id: track.getId().toString(),
      notes: [{ pitch: 'G4', start: 2, length: 5 }],
    });

    expect(result.success).toBe(true);
    expect(regionA.getNotes()).toHaveLength(0);
    expect(regionB.getStartFromBeat()).toBe(2);
    expect(regionB.getLength()).toBe(6);
    expect(regionB.getNotes()).toHaveLength(2);
    expect(regionB.getNotes().find(note => note.getId() === 'note-existing')?.getStartBeat()).toBe(2);
    expect(regionB.getNotes().find(note => note.getId() !== 'note-existing')?.getStartBeat()).toBe(0);
  });

  it('builds summaries when track_id is provided as a number', () => {
    const track = new KGMidiTrack('Lead', 1);
    const project = new KGProject('numeric-track-id-summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new AddNotesTool();
    const args = {
      track_id: track.getId(),
      notes: [
        { pitch: 'C4', start: 8, length: 2 },
        { pitch: 'E4', start: 10, length: 2 },
      ],
    };

    expect(tool.buildToolResultDisplayContent(args, { success: true, result: 'raw result' })).toBe(
      'Successfully created 2 notes in new region **Lead Region** on track **Lead**, spanning bars 3 to 3.',
    );
    expect(tool.buildConfirmationContent(args)).toBe(
      'Allow creating 2 notes on track **Lead** in a new region, spanning bars 3 to 3?',
    );
  });

  it('returns distinct raw, history, and UI guidance when no MIDI target is available', async () => {
    const project = new KGProject('no-target-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new AddNotesTool();
    const args = { notes: [{ pitch: 'C4', start: 0, length: 1 }] };
    const result = await tool.execute(args);

    expect(result).toEqual({ success: false, result: NO_MIDI_TARGET_RAW_MESSAGE });
    expect(tool.buildToolHistoryContent(args, result)).toBe(NO_MIDI_TARGET_HISTORY_MESSAGE);
    expect(tool.buildToolResultDisplayContent(args, result)).toBe(NO_MIDI_TARGET_UI_MESSAGE);
  });
});
