import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadBpmTool } from './ReadBpmTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { GlobalTrackType } from '../../core/global-track';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

describe('ReadBpmTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new ReadBpmTool();
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('reads ordered BPM regions from the global tempo track', async () => {
    const project = new KGProject('read-bpm', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    expect(track).not.toBeNull();
    track!.setRegions([
      new KGTempoRegion('region-2', track!.getId(), track!.getTrackIndex(), 140, 4, 4, 4),
      new KGTempoRegion('region-1', track!.getId(), track!.getTrackIndex(), 120, 0, 4, 4),
    ]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadBpmTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('[Beat: 0]: 120 BPM\n[Beat: 16]: 140 BPM');
  });

  it('preserves line breaks in UI and history display content', () => {
    const tool = new ReadBpmTool();
    const formatted = '[Beat: 0]: 120 BPM  \n[Beat: 16]: 140 BPM';
    const raw = '[Beat: 0]: 120 BPM\n[Beat: 16]: 140 BPM';

    expect(tool.buildToolResultDisplayContent(null, {
      success: true,
      result: raw,
    })).toBe(formatted);
    expect(tool.buildToolHistoryContent(null, {
      success: true,
      result: raw,
    })).toBe(raw);
  });

  it('falls back to the project-level BPM at beat 0 when no regions exist', async () => {
    const project = new KGProject('fallback-bpm', 8, 0, 132, { numerator: 4, denominator: 4 });

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadBpmTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('[Beat: 0]: 132 BPM');
  });

  it('returns a clean failure when the tempo track is missing', async () => {
    const project = new KGProject('missing-tempo-track', 8, 0, 120, { numerator: 4, denominator: 4 });
    project.setGlobalTracks([]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadBpmTool();
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.result).toContain('Tempo global track not found');
  });
});
