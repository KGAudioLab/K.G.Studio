import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveNotesTool } from './RemoveNotesTool';
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

describe('RemoveNotesTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    vi.restoreAllMocks();
  });

  it('builds confirmation and result summaries for note removal', () => {
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

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new RemoveNotesTool();
    const args = {
      start: 16,
      end: 24,
    };

    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.buildConfirmationContent(args)).toBe(
      'Allow removing 2 notes from beats 16-24, in region **Verse Melody** on track **Lead**, spanning bars 5 to 7?'
    );
    expect(tool.buildToolResultDisplayContent(args, { success: true, result: 'raw result' })).toBe(
      'Successfully removed 2 notes from beats 16-24, in region **Verse Melody** on track **Lead**, spanning bars 5 to 7.'
    );
  });
});
