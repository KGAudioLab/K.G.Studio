import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetUserSelectedMusicRangeAndTrackTool } from './GetUserSelectedMusicRangeAndTrackTool';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGGlobalTrack, GlobalTrackType } from '../../core/global-track/KGGlobalTrack';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { KGCore } from '../../core/KGCore';

const storeState = {
  activeRegionId: null as string | null,
  selectedRegionIds: [] as string[],
  selectedTrackId: null as string | null,
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

function buildProject(): KGProject {
  const project = new KGProject('selection-tool-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');

  const midiTrack = new KGMidiTrack('Lead', 1);
  midiTrack.setRegions([
    new KGMidiRegion('midi-a', midiTrack.getId().toString(), midiTrack.getTrackIndex(), 'A', 4, 8),
    new KGMidiRegion('midi-b', midiTrack.getId().toString(), midiTrack.getTrackIndex(), 'B', 20, 4),
  ]);
  project.setTracks([midiTrack]);

  const markerTrack = new KGGlobalTrack('global-marker', 0, GlobalTrackType.Marker, 'Marker');
  markerTrack.setRegions([
    new KGMarkerRegion('global-a', markerTrack.getId(), markerTrack.getTrackIndex(), 'Marker A', 2, 2),
  ]);

  project.setGlobalTracks(project.getGlobalTracks().map(track => (
    track.getType() === GlobalTrackType.Marker ? markerTrack : track
  )));

  return project;
}

function mockCore(project: KGProject) {
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project,
  } as unknown as KGCore);
}

describe('GetUserSelectedMusicRangeAndTrackTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    storeState.selectedRegionIds = [];
    storeState.selectedTrackId = null;
    vi.restoreAllMocks();
  });

  it('returns the selected music range and selected regular track', async () => {
    const project = buildProject();
    mockCore(project);
    storeState.selectedRegionIds = ['midi-a', 'midi-b'];
    storeState.selectedTrackId = '1';

    const tool = new GetUserSelectedMusicRangeAndTrackTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe(
      'Current Selected Music Range:\n- Start Beat: 4\n- End Beat: 24\n\nCurrent Selected Track:\ntrack_id: 1\ntrack_name: Lead',
    );
  });

  it('reports no selected track when the selection is global-only even if selectedTrackId is stale', async () => {
    const project = buildProject();
    mockCore(project);
    storeState.selectedRegionIds = ['global-a'];
    storeState.selectedTrackId = '1';

    const tool = new GetUserSelectedMusicRangeAndTrackTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe(
      'Current Selected Music Range:\n- Start Beat: 2\n- End Beat: 4\n\nCurrent Selected Track:\nNo selected track.',
    );
  });

  it('uses loop bounds and reports no selected track when nothing is selected', async () => {
    const project = buildProject();
    project.setIsLooping(true);
    project.setLoopingRange([2, 5]);
    mockCore(project);

    const tool = new GetUserSelectedMusicRangeAndTrackTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe(
      'Current Selected Music Range:\n- Start Beat: 8\n- End Beat: 24\n\nCurrent Selected Track:\nNo selected track.',
    );
  });
});
