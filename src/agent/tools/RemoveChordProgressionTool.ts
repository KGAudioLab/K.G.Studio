import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { DeleteMultipleGlobalRegionsCommand } from '../../core/commands/global-region/DeleteGlobalRegionCommand';
import { GlobalTrackType } from '../../core/global-track';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

interface ChordRemovalSummaryData {
  chordCount: number;
  startBeat: number;
  endBeat: number;
  firstBar: number;
  lastBar: number;
}

export class RemoveChordProgressionTool extends BaseTool {
  readonly name = 'remove_chord_progression';
  readonly description = 'Remove chord-reference regions from the global Chord track by absolute start-beat range. This removes whole chord-reference regions whose start beat falls within the requested range.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    start: {
      type: 'number',
      description: 'Start beat — the absolute beat position where the removal range begins. When start is less than end, regions starting exactly at this beat are removed.',
      required: true,
    },
    end: {
      type: 'number',
      description: 'End beat — the absolute beat position where the removal range ends. When start is less than end, this value is exclusive. When start equals end, only regions starting exactly at that beat are removed.',
      required: true,
    },
  };

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) {
      return undefined;
    }

    if (toolResult.result.startsWith('No chord references found')) {
      const summary = this.buildSummaryData(args);
      return summary
        ? `No chord references found for removal at beats ${summary.startBeat}-${summary.endBeat}.`
        : undefined;
    }

    const summary = this.buildResultSummaryData(args, toolResult.result);
    if (!summary) {
      return undefined;
    }

    return `Removed ${summary.chordCount} chord ${summary.chordCount === 1 ? 'reference' : 'references'} from the global Chord Track across ${summary.firstBar === summary.lastBar ? `bar ${summary.firstBar}` : `bars ${summary.firstBar} to ${summary.lastBar}`}.`;
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    const summary = this.buildSummaryData(args);
    if (!summary) {
      return undefined;
    }

    return `Allow removing ${summary.chordCount} chord ${summary.chordCount === 1 ? 'reference' : 'references'} from the global Chord Track across ${summary.firstBar === summary.lastBar ? `bar ${summary.firstBar}` : `bars ${summary.firstBar} to ${summary.lastBar}`}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const startBeat = params.start as number;
      const endBeat = params.end as number;
      this.validateRange(startBeat, endBeat);

      const matchingRegions = this.findMatchingRegions(startBeat, endBeat);
      if (matchingRegions.length === 0) {
        return this.createSuccessResult(
          `No chord references found with start beats in the requested range from beat ${startBeat} to ${endBeat}.`,
        );
      }

      await this.executeCommand(new DeleteMultipleGlobalRegionsCommand(matchingRegions.map(region => region.getId())));

      const details = matchingRegions
        .map(region => `"${region.getSymbol()}" at beat ${region.getStartFromBeat()}`)
        .join(', ');
      return this.createSuccessResult(
        `Successfully removed ${matchingRegions.length} chord ${matchingRegions.length === 1 ? 'reference' : 'references'} from the global chord track: ${details}.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove chord progression: ${error}`);
    }
  }

  private validateRange(startBeat: number, endBeat: number): void {
    if (startBeat < 0) {
      throw new Error(`Invalid start ${startBeat}. Must be >= 0.`);
    }
    if (endBeat < startBeat) {
      throw new Error(`Invalid beat range: end (${endBeat}) must be greater than or equal to start (${startBeat}).`);
    }
  }

  private findMatchingRegions(startBeat: number, endBeat: number): KGChordRegion[] {
    const project = this.getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      return [];
    }

    return chordTrack.getRegions()
      .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
      .filter(region => this.matchesRange(region.getStartFromBeat(), startBeat, endBeat))
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());
  }

  private matchesRange(regionStartBeat: number, startBeat: number, endBeat: number): boolean {
    if (startBeat === endBeat) {
      return regionStartBeat === startBeat;
    }

    return regionStartBeat >= startBeat && regionStartBeat < endBeat;
  }

  private buildSummaryData(args: Record<string, unknown>): ChordRemovalSummaryData | null {
    const typedArgs = args as { start?: number; end?: number };
    if (typeof typedArgs.start !== 'number' || typeof typedArgs.end !== 'number') {
      return null;
    }
    if (typedArgs.start < 0 || typedArgs.end < typedArgs.start) {
      return null;
    }

    const matchingRegions = this.findMatchingRegions(typedArgs.start, typedArgs.end);
    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;

    if (matchingRegions.length === 0) {
      const bar = Math.floor(typedArgs.start / beatsPerBar) + 1;
      return {
        chordCount: 0,
        startBeat: typedArgs.start,
        endBeat: typedArgs.end,
        firstBar: bar,
        lastBar: bar,
      };
    }

    const firstBeat = Math.min(...matchingRegions.map(region => region.getStartFromBeat()));
    const lastBeat = Math.max(...matchingRegions.map(region => region.getStartFromBeat() + region.getLength()));
    return {
      chordCount: matchingRegions.length,
      startBeat: typedArgs.start,
      endBeat: typedArgs.end,
      firstBar: Math.floor(firstBeat / beatsPerBar) + 1,
      lastBar: Math.max(1, Math.ceil(lastBeat / beatsPerBar)),
    };
  }

  private buildResultSummaryData(args: Record<string, unknown>, resultText: string): ChordRemovalSummaryData | null {
    const typedArgs = args as { start?: number; end?: number };
    if (typeof typedArgs.start !== 'number' || typeof typedArgs.end !== 'number') {
      return null;
    }
    if (typedArgs.start < 0 || typedArgs.end < typedArgs.start) {
      return null;
    }

    const countMatch = resultText.match(/Successfully removed (\d+) chord/);
    if (!countMatch) {
      return null;
    }

    const beatsPerBar = this.getCurrentProject().getTimeSignature().numerator;
    const firstBar = Math.floor(typedArgs.start / beatsPerBar) + 1;
    const lastBeatExclusive = typedArgs.start === typedArgs.end
      ? typedArgs.start + 1
      : typedArgs.end;
    const lastBar = Math.max(1, Math.ceil(lastBeatExclusive / beatsPerBar));

    return {
      chordCount: Number(countMatch[1]),
      startBeat: typedArgs.start,
      endBeat: typedArgs.end,
      firstBar,
      lastBar,
    };
  }
}
