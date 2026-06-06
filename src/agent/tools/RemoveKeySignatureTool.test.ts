import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveKeySignatureTool } from './RemoveKeySignatureTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
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

function getSignatureTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
  expect(track).not.toBeNull();
  return track!;
}

describe('RemoveKeySignatureTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new RemoveKeySignatureTool();
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('removes a single exact start-beat match when start equals end', async () => {
    const project = new KGProject('exact-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('sig-1', track.getId(), track.getTrackIndex(), 'C major', 0, 2, 4),
      new KGKeySignatureRegion('sig-2', track.getId(), track.getTrackIndex(), 'G major', 2, 6, 4),
    ]);
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    const result = await tool.execute({ start: 8, end: 8 });

    expect(result.success).toBe(true);
    expect((track.getRegions() as KGKeySignatureRegion[]).map(region => ({
      key: region.getKeySignature(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { key: 'C major', startBar: 0, lengthBars: 8 },
    ]);
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toBe(result.result);
  });

  it('removes multiple key-signature regions and preserves gapless collapse', async () => {
    const project = new KGProject('range-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('sig-1', track.getId(), track.getTrackIndex(), 'C major', 0, 2, 4),
      new KGKeySignatureRegion('sig-2', track.getId(), track.getTrackIndex(), 'G major', 2, 2, 4),
      new KGKeySignatureRegion('sig-3', track.getId(), track.getTrackIndex(), 'D major', 4, 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    const result = await tool.execute({ start: 8, end: 20 });

    expect(result.success).toBe(true);
    expect((track.getRegions() as KGKeySignatureRegion[]).map(region => ({
      key: region.getKeySignature(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { key: 'C major', startBar: 0, lengthBars: 8 },
    ]);
    expect(result.result).toContain('"G major" at beat 8');
    expect(result.result).toContain('"D major" at beat 16');
  });

  it('returns a successful message when no key-signature regions match the range', async () => {
    const project = new KGProject('none-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('sig-1', track.getId(), track.getTrackIndex(), 'C major', 0, 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    const result = await tool.execute({ start: 12, end: 16 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('No key-signature regions found');
  });

  it('deletes the only remaining key-signature region', async () => {
    const project = new KGProject('single-region-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('sig-1', track.getId(), track.getTrackIndex(), 'E minor', 0, 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    const result = await tool.execute({ start: 0, end: 0 });

    expect(result.success).toBe(true);
    expect(track.getRegions()).toHaveLength(0);
  });

  it('builds a confirmation summary for the affected bar span', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('sig-1', track.getId(), track.getTrackIndex(), 'G major', 2, 2, 4),
      new KGKeySignatureRegion('sig-2', track.getId(), track.getTrackIndex(), 'D major', 4, 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    expect(tool.buildConfirmationContent({ start: 8, end: 20 }))
      .toBe('Allow removing 2 key signature regions from the global Signature Track across bars 3 to 8?');
  });

  it('rejects invalid beat ranges', async () => {
    const project = new KGProject('bad-range-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new RemoveKeySignatureTool();
    const result = await tool.execute({ start: 8, end: 4 });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must be greater than or equal to start');
  });
});
