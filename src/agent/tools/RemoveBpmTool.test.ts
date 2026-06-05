import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveBpmTool } from './RemoveBpmTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
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

function getTempoTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  expect(track).not.toBeNull();
  return track!;
}

describe('RemoveBpmTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new RemoveBpmTool();
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('removes a single exact start-beat match when start equals end', async () => {
    const project = new KGProject('exact-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('tempo-1', track.getId(), track.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('tempo-2', track.getId(), track.getTrackIndex(), 140, 2, 6, 4),
    ]);
    mockCore(project);

    const tool = new RemoveBpmTool();
    const result = await tool.execute({ start: 8, end: 8 });

    expect(result.success).toBe(true);
    expect((track.getRegions() as KGTempoRegion[]).map(region => ({
      bpm: region.getBpm(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { bpm: 120, startBar: 0, lengthBars: 8 },
    ]);
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toBe(result.result);
  });

  it('removes multiple BPM regions and preserves gapless collapse', async () => {
    const project = new KGProject('range-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('tempo-1', track.getId(), track.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('tempo-2', track.getId(), track.getTrackIndex(), 128, 2, 2, 4),
      new KGTempoRegion('tempo-3', track.getId(), track.getTrackIndex(), 140, 4, 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveBpmTool();
    const result = await tool.execute({ start: 8, end: 20 });

    expect(result.success).toBe(true);
    expect((track.getRegions() as KGTempoRegion[]).map(region => ({
      bpm: region.getBpm(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { bpm: 120, startBar: 0, lengthBars: 8 },
    ]);
    expect(result.result).toContain('"128 BPM" at beat 8');
    expect(result.result).toContain('"140 BPM" at beat 16');
  });

  it('returns a successful message when no BPM regions match the range', async () => {
    const project = new KGProject('none-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('tempo-1', track.getId(), track.getTrackIndex(), 120, 0, 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveBpmTool();
    const result = await tool.execute({ start: 12, end: 16 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('No BPM regions found');
  });

  it('deletes the only remaining explicit BPM region', async () => {
    const project = new KGProject('single-region-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('tempo-1', track.getId(), track.getTrackIndex(), 132, 0, 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveBpmTool();
    const result = await tool.execute({ start: 0, end: 0 });

    expect(result.success).toBe(true);
    expect(track.getRegions()).toHaveLength(0);
    expect(project.getBpm()).toBe(120);
  });

  it('builds a confirmation summary for the affected bar span', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('tempo-1', track.getId(), track.getTrackIndex(), 128, 2, 2, 4),
      new KGTempoRegion('tempo-2', track.getId(), track.getTrackIndex(), 140, 4, 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveBpmTool();
    expect(tool.buildConfirmationContent({ start: 8, end: 20 }))
      .toBe('Allow removing 2 BPM regions from the global Tempo Track across bars 3 to 8?');
  });

  it('rejects invalid beat ranges', async () => {
    const project = new KGProject('bad-range-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new RemoveBpmTool();
    const result = await tool.execute({ start: 8, end: 4 });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must be greater than or equal to start');
  });
});
