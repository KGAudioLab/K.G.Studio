import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadMarkersTool } from './ReadMarkersTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { GlobalTrackType } from '../../core/global-track';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

describe('ReadMarkersTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new ReadMarkersTool();
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('reads ordered marker regions from the global marker track', async () => {
    const project = new KGProject('read-markers', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = findGlobalTrackByType(project, GlobalTrackType.Marker);
    expect(track).not.toBeNull();
    track!.setRegions([
      new KGMarkerRegion('region-2', track!.getId(), track!.getTrackIndex(), 'Verse', 8, 4),
      new KGMarkerRegion('region-1', track!.getId(), track!.getTrackIndex(), 'Intro', 0, 8),
    ]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadMarkersTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('[Beat: 0; Length: 8]: Intro\n[Beat: 8; Length: 4]: Verse');
  });

  it('preserves line breaks in UI and history display content', () => {
    const tool = new ReadMarkersTool();
    const formatted = '[Beat: 0; Length: 8]: Intro  \n[Beat: 8; Length: 4]: Verse';
    const raw = '[Beat: 0; Length: 8]: Intro\n[Beat: 8; Length: 4]: Verse';

    expect(tool.buildToolResultDisplayContent(null, {
      success: true,
      result: raw,
    })).toBe(formatted);
    expect(tool.buildToolHistoryContent(null, {
      success: true,
      result: raw,
    })).toBe(raw);
  });

  it('returns an absence message when no marker regions exist', async () => {
    const project = new KGProject('empty-markers', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadMarkersTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('No marker regions found on the global Marker track.');
  });
});
