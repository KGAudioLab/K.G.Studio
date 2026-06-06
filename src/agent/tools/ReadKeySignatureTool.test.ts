import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadKeySignatureTool } from './ReadKeySignatureTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { GlobalTrackType } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

describe('ReadKeySignatureTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new ReadKeySignatureTool();
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('reads ordered key-signature regions from the global signature track', async () => {
    const project = new KGProject('read-signatures', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    expect(track).not.toBeNull();
    track!.setRegions([
      new KGKeySignatureRegion('region-2', track!.getId(), track!.getTrackIndex(), 'D major', 4, 4, 4),
      new KGKeySignatureRegion('region-1', track!.getId(), track!.getTrackIndex(), 'G major', 0, 4, 4),
    ]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadKeySignatureTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('[Beat: 0]: G major\n[Beat: 16]: D major');
  });

  it('preserves line breaks in UI and history display content', () => {
    const tool = new ReadKeySignatureTool();
    const formatted = '[Beat: 0]: G major  \n[Beat: 16]: D major';
    const raw = '[Beat: 0]: G major\n[Beat: 16]: D major';

    expect(tool.buildToolResultDisplayContent(null, {
      success: true,
      result: raw,
    })).toBe(formatted);
    expect(tool.buildToolHistoryContent(null, {
      success: true,
      result: raw,
    })).toBe(raw);
  });

  it('falls back to the project-level key signature at beat 0 when no regions exist', async () => {
    const project = new KGProject('fallback-signatures', 8, 0, 120, { numerator: 4, denominator: 4 }, 'E minor');

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadKeySignatureTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('[Beat: 0]: E minor');
  });

  it('returns a clean failure when the signature track is missing', async () => {
    const project = new KGProject('missing-signature-track', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    project.setGlobalTracks([]);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadKeySignatureTool();
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.result).toContain('Signature global track not found');
  });
});
