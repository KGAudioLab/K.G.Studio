import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteBpmTool } from './WriteBpmTool';
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
  } as unknown as KGCore);
}

function getTempoTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  expect(track).not.toBeNull();
  return track!;
}

describe('WriteBpmTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the expected write-only availability and schema details', () => {
    const project = new KGProject('tool-definition-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const definition = tool.getDefinition();

    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(definition.function.name).toBe('write_bpm');
    expect(definition.function.description).toContain('Tempo track');
    expect(JSON.stringify(definition.function.parameters)).toContain('bpms');
  });

  it('builds a confirmation summary for a full-song rewrite', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    expect(tool.buildConfirmationContent({
      bpms: [
        { bpm: 100 },
        { bpm: 128, beat: 8 },
      ],
    })).toBe('Allow rebuilding the global Tempo track with default tempo 100 BPM and 1 explicit tempo change from beat 8 to beat 8?');
  });

  it('writes only a global/default BPM', async () => {
    const project = new KGProject('single-write-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const result = await tool.execute({
      bpms: [{ bpm: 96 }],
    });

    const track = getTempoTrack(project);

    expect(result.success).toBe(true);
    expect(project.getBpm()).toBe(96);
    expect(track.getRegions()).toHaveLength(0);
    expect(result.result).toContain('Project default BPM: 96 BPM');
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toBe(result.result);
  });

  it('writes default BPM plus explicit entries and keeps the track gapless', async () => {
    const project = new KGProject('explicit-write-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    const track = getTempoTrack(project);
    track.setRegions([
      new KGTempoRegion('existing-1', track.getId(), track.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('existing-2', track.getId(), track.getTrackIndex(), 140, 2, 6, 4),
    ]);
    mockCore(project);

    const tool = new WriteBpmTool();
    const result = await tool.execute({
      bpms: [
        { bpm: 100 },
        { bpm: 128, beat: 8 },
        { bpm: 144, beat: 16 },
      ],
    });

    expect(result.success).toBe(true);
    expect(project.getBpm()).toBe(100);
    expect((track.getRegions() as KGTempoRegion[]).map(region => ({
      bpm: region.getBpm(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { bpm: 100, startBar: 0, lengthBars: 2 },
      { bpm: 128, startBar: 2, lengthBars: 2 },
      { bpm: 144, startBar: 4, lengthBars: 4 },
    ]);
    expect(result.result).toContain('128 BPM from beat 8 (bar 3)');
  });

  it('rejects an empty BPM list', async () => {
    const project = new KGProject('empty-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const result = await tool.execute({ bpms: [] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must contain at least one BPM entry');
  });

  it('rejects invalid BPM values', async () => {
    const project = new KGProject('bad-bpm-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const zeroResult = await tool.execute({ bpms: [{ bpm: 0 }] });
    const nanResult = await tool.execute({ bpms: [{ bpm: Number.NaN }] });

    expect(zeroResult.success).toBe(false);
    expect(zeroResult.result).toContain('invalid "bpm"');
    expect(nanResult.success).toBe(false);
    expect(nanResult.result).toContain('invalid "bpm"');
  });

  it('rejects invalid beats', async () => {
    const project = new KGProject('bad-beat-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const badBeatResult = await tool.execute({ bpms: [{ bpm: 120, beat: -1 }] });
    const outOfRangeResult = await tool.execute({ bpms: [{ bpm: 120, beat: 32 }] });

    expect(badBeatResult.success).toBe(false);
    expect(badBeatResult.result).toContain('invalid "beat"');
    expect(outOfRangeResult.success).toBe(false);
    expect(outOfRangeResult.result).toContain('within the song range');
  });

  it('rejects duplicate global/default entries', async () => {
    const project = new KGProject('duplicate-default-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const result = await tool.execute({
      bpms: [
        { bpm: 100 },
        { bpm: 120, beat: '' as const },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('Only one global/default BPM entry');
  });

  it('rejects entries that collapse into the same bar after normalization', async () => {
    const project = new KGProject('same-bar-project', 8, 0, 120, { numerator: 4, denominator: 4 });
    mockCore(project);

    const tool = new WriteBpmTool();
    const result = await tool.execute({
      bpms: [
        { bpm: 100 },
        { bpm: 128, beat: 4 },
        { bpm: 132, beat: 7 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('after bar alignment');
  });
});
