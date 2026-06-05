import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadChordProgressionTool } from './ReadChordProgressionTool';
import { KGProject } from '../../core/KGProject';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';
import { GlobalTrackType } from '../../core/global-track';
import { KGCore } from '../../core/KGCore';

const storeState = {
  activeRegionId: null as string | null,
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

function buildProjectWithRegionAndOptionalChords(chords: string[] = []): {
  project: KGProject;
  midiRegion: KGMidiRegion;
} {
  const project = new KGProject('tool-test', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
  const midiTrack = new KGMidiTrack('Melody', 1);
  const midiRegion = new KGMidiRegion('midi-region-1', '1', 0, 'Melody Region', 0, 32);
  midiTrack.addRegion(midiRegion);
  project.setTracks([midiTrack]);

  const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
  expect(chordTrack).not.toBeNull();
  chords.forEach((symbol, index) => {
    chordTrack!.addRegion(new KGChordRegion(`chord-${index}`, chordTrack!.getId(), chordTrack!.getTrackIndex(), symbol, index * 4, 4));
  });

  return { project, midiRegion };
}

describe('ReadChordProgressionTool', () => {
  beforeEach(() => {
    storeState.activeRegionId = null;
    vi.restoreAllMocks();
  });

  it('reads chord progression from the active MIDI region', async () => {
    const { project, midiRegion } = buildProjectWithRegionAndOptionalChords(['Am', 'F', 'Dm', 'E7', 'Am', 'C', 'Dm', 'E7']);
    storeState.activeRegionId = midiRegion.getId();

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadChordProgressionTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toContain('Chord-symbol representation:');
    expect(result.result).toContain('[Am]4 | [F]4 | [Dm]4 | [E7]4 | [Am]4 | [C]4 | [Dm]4 | [E7]4 |');
  });

  it('reads the full chord track when no MIDI region is selected', async () => {
    const { project } = buildProjectWithRegionAndOptionalChords(['Am', 'F', 'Dm']);

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadChordProgressionTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toContain('[Am]4 | [F]4 | [Dm]4 |');
    expect(tool.buildToolResultDisplayContent({}, result)).toBe('Read the chord progression from bars 1 to 3.');
  });

  it('returns no-chord-defined guidance when the chord track has no chord regions', async () => {
    const { project } = buildProjectWithRegionAndOptionalChords();

    vi.spyOn(KGCore, 'instance').mockReturnValue({
      getCurrentProject: () => project,
      getSelectedItems: () => [],
    } as unknown as KGCore);

    const tool = new ReadChordProgressionTool();
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.result).toBe('No chord progression is defined for the requested range on the global chord track. Use read_music to inspect the notes directly.');
    expect(tool.buildToolHistoryContent({}, result)).toBe(
      'No chord progression is defined for that range on the global chord track. Use read_music to inspect the notes directly.',
    );
    expect(tool.buildToolResultDisplayContent({}, result)).toBe('No chord progression is defined for that range.');
  });
});
