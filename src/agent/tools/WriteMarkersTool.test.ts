import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteMarkersTool } from './WriteMarkersTool';
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
  } as unknown as KGCore);
}

function getMarkerTrack(project: KGProject) {
  const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
  expect(markerTrack).not.toBeNull();
  return markerTrack!;
}

describe('WriteMarkersTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the expected write-only availability and schema details', () => {
    const project = new KGProject('tool-definition-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const definition = tool.getDefinition();

    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(definition.function.name).toBe('write_markers');
    expect(definition.function.description).toContain('annotation-only');
    expect(JSON.stringify(definition.function.parameters)).toContain('marker');
  });

  it('writes a single marker into an empty marker track and normalizes the label', async () => {
    const project = new KGProject('single-write-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const result = await tool.execute({
      markers: [{ marker: '  Intro\nSection  ', beat: 4, length: 4 }],
    });

    const markerTrack = getMarkerTrack(project);
    expect(result.success).toBe(true);
    expect((markerTrack.getRegions()[0] as KGMarkerRegion).getName()).toBe('Intro Section');
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toContain('Successfully wrote 1 marker annotation');
    expect(result.result).toContain('[Beat: 4; Length: 4]: Intro Section');
  });

  it('builds a confirmation summary for the affected beat span', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    expect(tool.buildConfirmationContent({
      markers: [
        { marker: 'Intro', beat: 0, length: 4 },
        { marker: 'Verse', beat: 8, length: 4 },
      ],
    })).toBe('Allow writing 2 marker annotations to the global Marker track from beat 0 to beat 12?');
  });

  it('rejects an empty marker list', async () => {
    const project = new KGProject('empty-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const result = await tool.execute({ markers: [] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must contain at least one marker entry');
  });

  it('rejects empty marker labels', async () => {
    const project = new KGProject('bad-marker-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const result = await tool.execute({ markers: [{ marker: '   ', beat: 0, length: 4 }] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('invalid "marker"');
  });

  it('rejects invalid beat and non-positive length values', async () => {
    const project = new KGProject('bad-number-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const badBeatResult = await tool.execute({ markers: [{ marker: 'Intro', beat: -1, length: 4 }] });
    const badLengthResult = await tool.execute({ markers: [{ marker: 'Intro', beat: 0, length: 0 }] });

    expect(badBeatResult.success).toBe(false);
    expect(badBeatResult.result).toContain('invalid "beat"');
    expect(badLengthResult.success).toBe(false);
    expect(badLengthResult.result).toContain('invalid "length"');
  });

  it('rejects overlapping requested marker entries', async () => {
    const project = new KGProject('overlap-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteMarkersTool();
    const result = await tool.execute({
      markers: [
        { marker: 'Intro', beat: 0, length: 4 },
        { marker: 'Verse', beat: 3, length: 4 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('overlaps with marker entry 1');
  });

  it('replaces overlapping existing markers while preserving untouched regions', async () => {
    const project = new KGProject('preserve-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const markerTrack = getMarkerTrack(project);
    markerTrack.setRegions([
      new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Long Intro', 0, 8),
      new KGMarkerRegion('marker-2', markerTrack.getId(), markerTrack.getTrackIndex(), 'Outro', 8, 4),
    ]);
    mockCore(project);

    const tool = new WriteMarkersTool();
    const result = await tool.execute({
      markers: [
        { marker: 'Hit', beat: 3, length: 2 },
        { marker: 'Drop', beat: 10, length: 2 },
      ],
    });

    expect(result.success).toBe(true);
    expect((markerTrack.getRegions() as KGMarkerRegion[]).map(region => ({
      name: region.getName(),
      start: region.getStartFromBeat(),
      length: region.getLength(),
    }))).toEqual([
      { name: 'Long Intro', start: 0, length: 3 },
      { name: 'Hit', start: 3, length: 2 },
      { name: 'Long Intro', start: 5, length: 3 },
      { name: 'Outro', start: 8, length: 2 },
      { name: 'Drop', start: 10, length: 2 },
    ]);
    expect(result.result).toContain('annotation-only');
  });
});
