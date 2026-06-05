import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteKeySignatureTool } from './WriteKeySignatureTool';
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
  } as unknown as KGCore);
}

function getSignatureTrack(project: KGProject) {
  const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
  expect(track).not.toBeNull();
  return track!;
}

describe('WriteKeySignatureTool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the expected write-only availability and schema details', () => {
    const project = new KGProject('tool-definition-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const definition = tool.getDefinition();

    expect(tool.isReadOnlyTool()).toBe(false);
    expect(tool.isAvailableInEfficientMode()).toBe(false);
    expect(definition.function.name).toBe('write_key_signature');
    expect(definition.function.description).toContain('C major');
    expect(JSON.stringify(definition.function.parameters)).toContain('F# minor');
    expect(JSON.stringify(definition.function.parameters)).toContain('Bb major');
  });

  it('builds a confirmation summary for a full-song rewrite', () => {
    const project = new KGProject('confirmation-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    expect(tool.buildConfirmationContent({
      key_signatures: [
        { key_signature: 'C major' },
        { key_signature: 'G major', beat: 8 },
      ],
    })).toBe('Allow rebuilding the global Signature track with 2 key signatures from beat 8 to beat 8?');
  });

  it('writes a single global key signature across the full song', async () => {
    const project = new KGProject('single-write-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({
      key_signatures: [{ key_signature: 'E minor' }],
    });

    const track = getSignatureTrack(project);
    const regions = track.getRegions() as KGKeySignatureRegion[];

    expect(result.success).toBe(true);
    expect(regions).toHaveLength(1);
    expect(regions[0].getKeySignature()).toBe('E minor');
    expect(regions[0].getStartBar()).toBe(0);
    expect(regions[0].getLengthBars()).toBe(8);
    expect(tool.buildToolHistoryContent({}, result)).toBe(result.result);
    expect(tool.buildToolResultDisplayContent({}, result)).toBe(result.result);
  });

  it('rewrites the signature track from explicit beat entries and keeps it gapless', async () => {
    const project = new KGProject('explicit-write-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    const track = getSignatureTrack(project);
    track.setRegions([
      new KGKeySignatureRegion('existing-1', track.getId(), track.getTrackIndex(), 'D major', 0, 2, 4),
      new KGKeySignatureRegion('existing-2', track.getId(), track.getTrackIndex(), 'A major', 2, 6, 4),
    ]);
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({
      key_signatures: [
        { key_signature: 'G major' },
        { key_signature: 'D major', beat: 8 },
        { key_signature: 'A major', beat: 16 },
      ],
    });

    expect(result.success).toBe(true);
    expect((track.getRegions() as KGKeySignatureRegion[]).map(region => ({
      keySignature: region.getKeySignature(),
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }))).toEqual([
      { keySignature: 'G major', startBar: 0, lengthBars: 2 },
      { keySignature: 'D major', startBar: 2, lengthBars: 2 },
      { keySignature: 'A major', startBar: 4, lengthBars: 4 },
    ]);
  });

  it('rejects an empty key-signature list', async () => {
    const project = new KGProject('empty-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({ key_signatures: [] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('must contain at least one key-signature entry');
  });

  it('rejects invalid key-signature strings', async () => {
    const project = new KGProject('bad-key-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({ key_signatures: [{ key_signature: 'not-a-key' }] });

    expect(result.success).toBe(false);
    expect(result.result).toContain('invalid "key_signature"');
  });

  it('rejects invalid beats', async () => {
    const project = new KGProject('bad-beat-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const badBeatResult = await tool.execute({ key_signatures: [{ key_signature: 'C major', beat: -1 }] });
    const outOfRangeResult = await tool.execute({ key_signatures: [{ key_signature: 'C major', beat: 32 }] });

    expect(badBeatResult.success).toBe(false);
    expect(badBeatResult.result).toContain('invalid "beat"');
    expect(outOfRangeResult.success).toBe(false);
    expect(outOfRangeResult.result).toContain('within the song range');
  });

  it('rejects duplicate global/default entries', async () => {
    const project = new KGProject('duplicate-default-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({
      key_signatures: [
        { key_signature: 'C major' },
        { key_signature: 'G major', beat: '' as const },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('Only one global/default key signature entry');
  });

  it('rejects entries that collapse into the same bar after normalization', async () => {
    const project = new KGProject('same-bar-project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
    mockCore(project);

    const tool = new WriteKeySignatureTool();
    const result = await tool.execute({
      key_signatures: [
        { key_signature: 'C major' },
        { key_signature: 'G major', beat: 4 },
        { key_signature: 'D major', beat: 7 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('after bar alignment');
  });
});
