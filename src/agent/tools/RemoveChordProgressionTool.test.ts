import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveChordProgressionTool } from './RemoveChordProgressionTool';
import { KGProject } from '../../core/KGProject';
import { KGCore } from '../../core/KGCore';
import { KGChordRegion } from '../../core/region/KGChordRegion';
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

function getChordTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Chord);
  expect(track).not.toBeNull();
  return track!;
}

describe('RemoveChordProgressionTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is only available in regular mode', () => {
    const tool = new RemoveChordProgressionTool();
    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
  });

  it('removes a single exact start-beat match when start equals end', async () => {
    const project = new KGProject('exact-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const chordTrack = getChordTrack(project);
    chordTrack.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 4, 4),
    ]);
    mockCore(project);

    const tool = new RemoveChordProgressionTool();
    const result = await tool.execute({ start: 4, end: 4 });

    expect(result.success).toBe(true);
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => region.getSymbol())).toEqual(['C']);
    expect(result.result).toContain('"G" at beat 4');
  });

  it('removes multiple chord regions in a start-inclusive, end-exclusive range', async () => {
    const project = new KGProject('range-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const chordTrack = getChordTrack(project);
    chordTrack.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'Dm', 4, 4),
      new KGChordRegion('chord-3', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveChordProgressionTool();
    const result = await tool.execute({ start: 4, end: 8 });

    expect(result.success).toBe(true);
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => region.getSymbol())).toEqual(['C', 'G']);
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({ start: 4, end: 8 }, result))
      .toBe('Removed 1 chord reference from the global Chord Track across bar 2.');
  });

  it('returns a successful message when no chord references match the range', async () => {
    const project = new KGProject('none-remove-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const chordTrack = getChordTrack(project);
    chordTrack.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'C', 0, 4),
    ]);
    mockCore(project);

    const tool = new RemoveChordProgressionTool();
    const result = await tool.execute({ start: 12, end: 16 });

    expect(result.success).toBe(true);
    expect(result.result).toContain('No chord references found');
    expect(tool.buildToolResultDisplayContent({ start: 12, end: 16 }, result))
      .toBe('No chord references found for removal at beats 12-16.');
  });

  it('builds a confirmation summary for the affected bar span', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const chordTrack = getChordTrack(project);
    chordTrack.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Dm', 4, 4),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'G', 8, 4),
    ]);
    mockCore(project);

    const tool = new RemoveChordProgressionTool();
    expect(tool.buildConfirmationContent({ start: 4, end: 12 }))
      .toBe('Allow removing 2 chord references from the global Chord Track across bars 2 to 3?');
  });

  it('rejects invalid beat ranges', async () => {
    const project = new KGProject('bad-range-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new RemoveChordProgressionTool();
    const result = await tool.execute({ start: 8, end: 4 });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must be greater than or equal to start');
  });
});
