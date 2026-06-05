import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveMarkersTool } from './RemoveMarkersTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';
import { GlobalTrackType } from '../../core/global-track';

function mockCore(project: KGProject) {
  vi.spyOn(KGCore, 'instance').mockReturnValue({
    getCurrentProject: () => project,
    getSelectedItems: () => [],
    executeCommand: (command: { execute(): void }) => command.execute(),
    removeSelectedItem: vi.fn(),
  } as unknown as KGCore);
}

function getMarkerTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Marker);
  expect(track).not.toBeNull();
  return track!;
}

describe('RemoveMarkersTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new RemoveMarkersTool();
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('removes a single exact start-beat match when start equals end', async () => {
    const project = new KGProject('exact-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const markerTrack = getMarkerTrack(project);
    markerTrack.setRegions([
      new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Intro', 0, 4),
      new KGMarkerRegion('marker-2', markerTrack.getId(), markerTrack.getTrackIndex(), 'Verse', 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveMarkersTool();
    const result = await tool.execute({ start: 4, end: 4 });

    expect(result.success).toBe(true);
    expect((markerTrack.getRegions() as KGMarkerRegion[]).map(region => region.getName())).toEqual(['Intro']);
    expect(result.result).toContain('[Beat: 4; Length: 4]: Verse');
  });

  it('removes multiple marker regions in a start-inclusive, end-exclusive range', async () => {
    const project = new KGProject('range-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const markerTrack = getMarkerTrack(project);
    markerTrack.setRegions([
      new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Intro', 0, 4),
      new KGMarkerRegion('marker-2', markerTrack.getId(), markerTrack.getTrackIndex(), 'Verse', 4, 4),
      new KGMarkerRegion('marker-3', markerTrack.getId(), markerTrack.getTrackIndex(), 'Chorus', 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveMarkersTool();
    const result = await tool.execute({ start: 4, end: 8 });

    expect(result.success).toBe(true);
    expect((markerTrack.getRegions() as KGMarkerRegion[]).map(region => region.getName())).toEqual(['Intro', 'Chorus']);
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toContain('Successfully removed 1 marker annotation');
  });

  it('returns a successful message when no markers match the range', async () => {
    const project = new KGProject('none-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const markerTrack = getMarkerTrack(project);
    markerTrack.setRegions([
      new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Intro', 0, 4),
    ]);
    mockCore(project);

    const tool = new RemoveMarkersTool();
    const result = await tool.execute({ start: 12, end: 16 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('No marker annotations found');
  });

  it('rejects invalid beat ranges', async () => {
    const project = new KGProject('bad-range-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new RemoveMarkersTool();
    const result = await tool.execute({ start: 8, end: 4 });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must be greater than or equal to start');
  });
});
