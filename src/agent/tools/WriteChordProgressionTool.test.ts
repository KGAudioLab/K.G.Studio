import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteChordProgressionTool } from './WriteChordProgressionTool';
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
  } as unknown as KGCore);
}

function getChordTrack(project: KGProject) {
  const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
  expect(chordTrack).not.toBeNull();
  return chordTrack!;
}

describe('WriteChordProgressionTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the expected write-only availability and schema details', () => {
    const project = new KGProject('tool-definition-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const definition = tool.getDefinition();

    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(definition.function.name).toBe('write_chord_progression');
    expect(definition.function.description).toContain('reference only');
    expect(JSON.stringify(definition.function.parameters)).toContain('Bm7b5');
  });

  it('writes a single chord into an empty chord track and canonicalizes the symbol', async () => {
    const project = new KGProject('single-write-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const result = await tool.execute({
      chords: [{ chord: '  bm7b5 ', start: 4, length: 4 }],
    });

    const chordTrack = getChordTrack(project);
    expect(result.success).toBe(true);
    expect((chordTrack.getRegions()[0] as KGChordRegion).getSymbol()).toBe('Bm7b5');
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({ chords: [{ chord: 'Bm7b5', start: 4, length: 4 }] }, result))
      .toBe('Updated 1 chord reference on the global Chord Track across bar 2.');
  });

  it('builds a confirmation summary for the affected bar span', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    expect(tool.buildConfirmationContent({
      chords: [
        { chord: 'C', start: 0, length: 4 },
        { chord: 'Dm', start: 4, length: 4 },
      ],
    })).toBe('Allow updating 2 chord references on the global Chord Track across bars 1 to 2?');
  });

  it('rejects an empty chord list', async () => {
    const project = new KGProject('empty-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const result = await tool.execute({ chords: [] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must contain at least one chord entry');
  });

  it('rejects unparsable chord symbols with a field-specific error', async () => {
    const project = new KGProject('bad-chord-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const result = await tool.execute({ chords: [{ chord: 'not-a-chord', start: 0, length: 4 }] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('Chord entry 1 has invalid "chord"');
  });

  it('rejects negative start and non-positive length values', async () => {
    const project = new KGProject('bad-number-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const badStartResult = await tool.execute({ chords: [{ chord: 'C', start: -1, length: 4 }] });
    const badLengthResult = await tool.execute({ chords: [{ chord: 'C', start: 0, length: 0 }] });

    expect(badStartResult.success).toBe(false);
    expect(badStartResult.result).toContain('invalid "start"');
    expect(badLengthResult.success).toBe(false);
    expect(badLengthResult.result).toContain('invalid "length"');
  });

  it('rejects overlapping requested chord entries', async () => {
    const project = new KGProject('overlap-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const result = await tool.execute({
      chords: [
        { chord: 'C', start: 0, length: 4 },
        { chord: 'Dm', start: 3, length: 4 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('overlaps with chord entry 1');
  });

  it('preserves untouched gaps and trims existing overlapping chord regions', async () => {
    const project = new KGProject('preserve-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const chordTrack = getChordTrack(project);
    chordTrack.setRegions([
      new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Am', 0, 8),
      new KGChordRegion('chord-2', chordTrack.getId(), chordTrack.getTrackIndex(), 'F', 8, 4),
    ]);
    mockCore(project);

    const tool = new WriteChordProgressionTool();
    const result = await tool.execute({
      chords: [
        { chord: 'C', start: 3, length: 2 },
        { chord: 'G', start: 10, length: 2 },
      ],
    });

    expect(result.success).toBe(true);
    expect((chordTrack.getRegions() as KGChordRegion[]).map(region => ({
      symbol: region.getSymbol(),
      start: region.getStartFromBeat(),
      length: region.getLength(),
    }))).toEqual([
      { symbol: 'Am', start: 0, length: 3 },
      { symbol: 'C', start: 3, length: 2 },
      { symbol: 'Am', start: 5, length: 3 },
      { symbol: 'F', start: 8, length: 2 },
      { symbol: 'G', start: 10, length: 2 },
    ]);
    expect(result.result).toContain('harmonic reference only');
  });
});
