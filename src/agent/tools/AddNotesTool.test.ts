import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddNotesTool } from './AddNotesTool';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';

const storeState = {
  activeRegionId: null as string | null,
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

describe('AddNotesTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    vi.restoreAllMocks();
  });

  it('builds a compact summary for successful note creation', () => {
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region-1', track.getId().toString(), track.getTrackIndex(), 'Verse Melody', 0, 32);
    track.setRegions([region]);
    const project = new KGProject('summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setTracks([track]);
    storeState.activeRegionId = region.getId();

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new AddNotesTool();
    const summary = tool.buildToolResultDisplayContent(
      {
        notes: [
          { pitch: 'C4', start: 16, length: 4 },
          { pitch: 'E4', start: 20, length: 8 },
        ],
      },
      { success: true, result: 'raw result' },
    );

    expect(summary).toBe(
      'Successfully created 2 notes in region **Verse Melody** on track **Lead**, spanning bars 5 to 7.'
    );
  });

  it('returns no compact summary when the target region cannot be resolved', () => {
    const project = new KGProject('summary-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new AddNotesTool();
    const summary = tool.buildToolResultDisplayContent(
      {
        notes: [{ pitch: 'C4', start: 0, length: 4 }],
      },
      { success: true, result: 'raw result' },
    );

    expect(summary).toBeUndefined();
  });
});
