import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { resolveActiveOrSelectedMidiRegionContext } from './toolTargeting';
import { convertBeatRangeChordProgressionToABCNotation } from '../../util/abcNotationUtil';
import { GlobalTrackType } from '../../core/global-track';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

interface ChordProgressionRange {
  startBeat: number;
  endBeat: number;
  scope: 'region' | 'song';
}

const NO_CHORD_PROGRESSION_RAW_MESSAGE =
  'No chord progression is defined for the requested range on the global chord track. Use read_music to inspect the notes directly.';

const NO_CHORD_PROGRESSION_HISTORY_MESSAGE =
  'No chord progression is defined for that range on the global chord track. Use read_music to inspect the notes directly.';

const NO_CHORD_PROGRESSION_UI_MESSAGE =
  'No chord progression is defined for that range.';

export class ReadChordProgressionTool extends BaseTool {
  readonly name = 'read_chord_progression';
  readonly description = 'Read the user-defined chord progression from the global chord track. If a MIDI region is active or selected, read the progression for that region. Otherwise, read the full song progression from bar 1 through the last chord region on the chord track.';

  readonly parameters: Record<string, ToolParameter> = {};

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    void args;

    if (!toolResult.success) {
      return undefined;
    }

    if (toolResult.result === NO_CHORD_PROGRESSION_RAW_MESSAGE) {
      return NO_CHORD_PROGRESSION_UI_MESSAGE;
    }

    const range = this.resolveReadRange();
    if (!range) {
      return undefined;
    }

    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;
    const startBar = Math.floor(range.startBeat / beatsPerBar) + 1;
    const endBar = Math.max(1, Math.ceil(range.endBeat / beatsPerBar));
    return `Read the chord progression from ${startBar === endBar ? `bar ${startBar}` : `bars ${startBar} to ${endBar}`}.`;
  }

  override buildToolHistoryContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    void args;
    if (toolResult.result === NO_CHORD_PROGRESSION_RAW_MESSAGE) {
      return NO_CHORD_PROGRESSION_HISTORY_MESSAGE;
    }

    return undefined;
  }

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const range = this.resolveReadRange();
      if (!range) {
        return this.createSuccessResult(NO_CHORD_PROGRESSION_RAW_MESSAGE);
      }

      const result = convertBeatRangeChordProgressionToABCNotation(
        this.getCurrentProject(),
        range.startBeat,
        range.endBeat,
      );
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read chord progression: ${error}`);
    }
  }

  private resolveReadRange(): ChordProgressionRange | null {
    const resolvedRegion = resolveActiveOrSelectedMidiRegionContext();
    if (resolvedRegion) {
      return {
        startBeat: resolvedRegion.region.getStartFromBeat(),
        endBeat: resolvedRegion.region.getStartFromBeat() + resolvedRegion.region.getLength(),
        scope: 'region',
      };
    }

    const chordTrack = findGlobalTrackByType(this.getCurrentProject(), GlobalTrackType.Chord);
    if (!chordTrack) {
      return null;
    }

    const chordRegions = chordTrack.getRegions().filter((region): region is KGChordRegion => region instanceof KGChordRegion);
    if (chordRegions.length === 0) {
      return null;
    }

    return {
      startBeat: 0,
      endBeat: Math.max(...chordRegions.map(region => region.getStartFromBeat() + region.getLength())),
      scope: 'song',
    };
  }
}
