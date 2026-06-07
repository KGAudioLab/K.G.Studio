import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveNotesTool } from './RemoveNotesTool';
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

describe('RemoveNotesTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    vi.restoreAllMocks();
  });

  it('builds confirmation and result summaries for region-scoped removal', () => {
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region-1', track.getId().toString(), track.getTrackIndex(), 'Verse Melody', 0, 32);
    region.setNotes([
      new KGMidiNote('note-1', 16, 20, 60, 100),
      new KGMidiNote('note-2', 20, 28, 64, 100),
    ]);
    track.setRegions([region]);
    const project = new KGProject('summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    storeState.activeRegionId = region.getId();
    mockCore(project);

    const tool = new RemoveNotesTool();
    const args = { start: 16, end: 24 };

    expect(tool.buildConfirmationContent(args)).toBe(
      'Allow removing 2 notes from beats 16-24, in region **Verse Melody** on track **Lead**, spanning bars 5 to 7?',
    );
    expect(tool.buildToolResultDisplayContent(args, { success: true, result: 'raw result' })).toBe(
      'Successfully removed 2 notes from beats 16-24, in region **Verse Melody** on track **Lead**, spanning bars 5 to 7.',
    );
  });

  it('removes notes across all MIDI regions on a track when track_id is provided', async () => {
    const track = new KGMidiTrack('Lead', 1);
    const regionA = new KGMidiRegion('region-a', track.getId().toString(), track.getTrackIndex(), 'A', 0, 8);
    const regionB = new KGMidiRegion('region-b', track.getId().toString(), track.getTrackIndex(), 'B', 8, 8);
    regionA.setNotes([new KGMidiNote('note-1', 2, 3, 60, 100)]);
    regionB.setNotes([new KGMidiNote('note-2', 2, 3, 64, 100)]);
    track.setRegions([regionA, regionB]);
    const project = new KGProject('track-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_id: track.getId().toString(),
      start: 0,
      end: 12,
    });

    expect(result.success).toBe(true);
    expect(regionA.getNotes()).toHaveLength(0);
    expect(regionB.getNotes()).toHaveLength(0);
  });

  it('removes notes across all MIDI regions on a track when track_id is numeric', async () => {
    const track = new KGMidiTrack('Lead', 1);
    const regionA = new KGMidiRegion('region-a', track.getId().toString(), track.getTrackIndex(), 'A', 0, 8);
    const regionB = new KGMidiRegion('region-b', track.getId().toString(), track.getTrackIndex(), 'B', 8, 8);
    regionA.setNotes([new KGMidiNote('note-1', 2, 3, 60, 100)]);
    regionB.setNotes([new KGMidiNote('note-2', 2, 3, 64, 100)]);
    track.setRegions([regionA, regionB]);
    const project = new KGProject('numeric-track-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_id: track.getId(),
      start: 0,
      end: 12,
    });

    expect(result.success).toBe(true);
    expect(regionA.getNotes()).toHaveLength(0);
    expect(regionB.getNotes()).toHaveLength(0);
  });

  it('removes notes across a track resolved by track_name when track_id is omitted', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1);
    const bassTrack = new KGMidiTrack('Bass', 2);
    const leadRegion = new KGMidiRegion('lead-region', leadTrack.getId().toString(), leadTrack.getTrackIndex(), 'Lead Region', 0, 8);
    const bassRegion = new KGMidiRegion('bass-region', bassTrack.getId().toString(), bassTrack.getTrackIndex(), 'Bass Region', 0, 8);
    leadRegion.setNotes([new KGMidiNote('lead-note', 1, 2, 60, 100)]);
    bassRegion.setNotes([new KGMidiNote('bass-note', 1, 2, 48, 100)]);
    leadTrack.setRegions([leadRegion]);
    bassTrack.setRegions([bassRegion]);
    const project = new KGProject('remove-track-name-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_name: 'Bass',
      start: 0,
      end: 4,
    });

    expect(result.success).toBe(true);
    expect(leadRegion.getNotes()).toHaveLength(1);
    expect(bassRegion.getNotes()).toHaveLength(0);
  });

  it('uses track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1);
    const bassTrack = new KGMidiTrack('Bass', 2);
    const leadRegion = new KGMidiRegion('lead-region', leadTrack.getId().toString(), leadTrack.getTrackIndex(), 'Lead Region', 0, 8);
    const bassRegion = new KGMidiRegion('bass-region', bassTrack.getId().toString(), bassTrack.getTrackIndex(), 'Bass Region', 0, 8);
    leadRegion.setNotes([new KGMidiNote('lead-note', 1, 2, 60, 100)]);
    bassRegion.setNotes([new KGMidiNote('bass-note', 1, 2, 48, 100)]);
    leadTrack.setRegions([leadRegion]);
    bassTrack.setRegions([bassRegion]);
    const project = new KGProject('remove-track-id-precedence-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_id: leadTrack.getId().toString(),
      track_name: 'Bass',
      start: 0,
      end: 4,
    });

    expect(result.success).toBe(true);
    expect(leadRegion.getNotes()).toHaveLength(0);
    expect(bassRegion.getNotes()).toHaveLength(1);
  });

  it('uses numeric track_id when both track_id and track_name are provided', async () => {
    const leadTrack = new KGMidiTrack('Lead', 1);
    const bassTrack = new KGMidiTrack('Bass', 2);
    const leadRegion = new KGMidiRegion('lead-region', leadTrack.getId().toString(), leadTrack.getTrackIndex(), 'Lead Region', 0, 8);
    const bassRegion = new KGMidiRegion('bass-region', bassTrack.getId().toString(), bassTrack.getTrackIndex(), 'Bass Region', 0, 8);
    leadRegion.setNotes([new KGMidiNote('lead-note', 1, 2, 60, 100)]);
    bassRegion.setNotes([new KGMidiNote('bass-note', 1, 2, 48, 100)]);
    leadTrack.setRegions([leadRegion]);
    bassTrack.setRegions([bassRegion]);
    const project = new KGProject('numeric-remove-track-id-precedence-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([leadTrack, bassTrack]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_id: leadTrack.getId(),
      track_name: 'Bass',
      start: 0,
      end: 4,
    });

    expect(result.success).toBe(true);
    expect(leadRegion.getNotes()).toHaveLength(0);
    expect(bassRegion.getNotes()).toHaveLength(1);
  });

  it('uses the first matching track when duplicate track names exist', async () => {
    const firstLead = new KGMidiTrack('Lead', 1);
    const secondLead = new KGMidiTrack('Lead', 2);
    const firstRegion = new KGMidiRegion('first-region', firstLead.getId().toString(), firstLead.getTrackIndex(), 'First Lead Region', 0, 8);
    const secondRegion = new KGMidiRegion('second-region', secondLead.getId().toString(), secondLead.getTrackIndex(), 'Second Lead Region', 0, 8);
    firstRegion.setNotes([new KGMidiNote('first-note', 1, 2, 60, 100)]);
    secondRegion.setNotes([new KGMidiNote('second-note', 1, 2, 64, 100)]);
    firstLead.setRegions([firstRegion]);
    secondLead.setRegions([secondRegion]);
    const project = new KGProject('remove-duplicate-track-name-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([firstLead, secondLead]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const result = await tool.execute({
      track_name: 'Lead',
      start: 0,
      end: 4,
    });

    expect(result.success).toBe(true);
    expect(firstRegion.getNotes()).toHaveLength(0);
    expect(secondRegion.getNotes()).toHaveLength(1);
  });

  it('builds confirmation and result summaries when track_id is numeric', () => {
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region-1', track.getId().toString(), track.getTrackIndex(), 'Verse Melody', 0, 32);
    region.setNotes([
      new KGMidiNote('note-1', 16, 20, 60, 100),
      new KGMidiNote('note-2', 20, 28, 64, 100),
    ]);
    track.setRegions([region]);
    const project = new KGProject('numeric-remove-summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    mockCore(project);

    const tool = new RemoveNotesTool();
    const args = { track_id: track.getId(), start: 16, end: 24 };

    expect(tool.buildConfirmationContent(args)).toBe(
      'Allow removing 2 notes from beats 16-24, on track **Lead**, spanning bars 5 to 7?',
    );
    expect(tool.buildToolResultDisplayContent(args, { success: true, result: 'raw result' })).toBe(
      'Successfully removed 2 notes from beats 16-24, on track **Lead**, spanning bars 5 to 7.',
    );
  });

  it('returns distinct raw, history, and UI guidance when no MIDI target is available', async () => {
    const project = new KGProject('no-target-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new RemoveNotesTool();
    const args = { start: 0, end: 4 };
    const result = await tool.execute(args);

    expect(result).toEqual({ success: false, result: NO_MIDI_TARGET_RAW_MESSAGE });
    expect(tool.buildToolHistoryContent(args, result)).toBe(NO_MIDI_TARGET_HISTORY_MESSAGE);
    expect(tool.buildToolResultDisplayContent(args, result)).toBe(NO_MIDI_TARGET_UI_MESSAGE);
  });
});
