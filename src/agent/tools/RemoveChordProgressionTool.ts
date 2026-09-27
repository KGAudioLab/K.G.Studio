import { BaseTool } from './BaseTool';
import { quarterNotesToTicks, ticksPerBar, ticksToQuarterNotes } from '../../core/timing';
import type { ToolParameter, ToolResult } from './BaseTool';
import { DeleteMultipleGlobalRegionsCommand } from '../../core/commands/global-region/DeleteGlobalRegionCommand';
import { GlobalTrackType } from '../../core/global-track';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

interface ChordRemovalSummaryData {
  chordCount: number;
  startTick: number;
  endTick: number;
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
        ? `No chord references found for removal at quarter-notes ${ticksToQuarterNotes(summary.startTick)}-${ticksToQuarterNotes(summary.endTick)}.`
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

      const startTick = quarterNotesToTicks(params.start as number);
      const endTick = quarterNotesToTicks(params.end as number);
      this.validateRange(startTick, endTick);

      const matchingRegions = this.findMatchingRegions(startTick, endTick);
      if (matchingRegions.length === 0) {
        return this.createSuccessResult(
          `No chord references found in the requested quarter-note range ${ticksToQuarterNotes(startTick)} to ${ticksToQuarterNotes(endTick)}.`,
        );
      }

      await this.executeCommand(new DeleteMultipleGlobalRegionsCommand(matchingRegions.map(region => region.getId())));

      const details = matchingRegions
        .map(region => `"${region.getSymbol()}" at quarter-note ${ticksToQuarterNotes(region.getStartTick())}`)
        .join(', ');
      return this.createSuccessResult(
        `Successfully removed ${matchingRegions.length} chord ${matchingRegions.length === 1 ? 'reference' : 'references'} from the global chord track: ${details}.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove chord progression: ${error}`);
    }
  }

  private validateRange(startTick: number, endTick: number): void {
    if (startTick < 0) {
      throw new Error(`Invalid start ${startTick}. Must be >= 0.`);
    }
    if (endTick < startTick) {
      throw new Error(`Invalid beat range: end (${endTick}) must be greater than or equal to start (${startTick}).`);
    }
  }

  private findMatchingRegions(startTick: number, endTick: number): KGChordRegion[] {
    const project = this.getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      return [];
    }

    return chordTrack.getRegions()
      .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
      .filter(region => this.matchesRange(region.getStartTick(), startTick, endTick))
      .sort((left, right) => left.getStartTick() - right.getStartTick());
  }

  private matchesRange(regionStartTick: number, startTick: number, endTick: number): boolean {
    if (startTick === endTick) {
      return regionStartTick === startTick;
    }

    return regionStartTick >= startTick && regionStartTick < endTick;
  }

  private buildSummaryData(args: Record<string, unknown>): ChordRemovalSummaryData | null {
    const typedArgs = args as { start?: number; end?: number };
    if (typeof typedArgs.start !== 'number' || typeof typedArgs.end !== 'number') {
      return null;
    }
    if (typedArgs.start < 0 || typedArgs.end < typedArgs.start) {
      return null;
    }

    const startTick = quarterNotesToTicks(typedArgs.start);
    const endTick = quarterNotesToTicks(typedArgs.end);
    const matchingRegions = this.findMatchingRegions(startTick, endTick);
    const currentTimeSignature = this.getCurrentProject().getTimeSignature();
    const barTicks = ticksPerBar(currentTimeSignature);

    if (matchingRegions.length === 0) {
      const bar = Math.floor(startTick / barTicks) + 1;
      return {
        chordCount: 0,
        startTick,
        endTick,
        firstBar: bar,
        lastBar: bar,
      };
    }

    const firstBeat = Math.min(...matchingRegions.map(region => region.getStartTick()));
    const lastBeat = Math.max(...matchingRegions.map(region => region.getStartTick() + region.getLengthTicks()));
    return {
      chordCount: matchingRegions.length,
      startTick,
      endTick,
      firstBar: Math.floor(firstBeat / barTicks) + 1,
      lastBar: Math.max(1, Math.ceil(lastBeat / barTicks)),
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

    const barTicks = ticksPerBar(this.getCurrentProject().getTimeSignature());
    const startTick = quarterNotesToTicks(typedArgs.start);
    const endTick = quarterNotesToTicks(typedArgs.end);
    const firstBar = Math.floor(startTick / barTicks) + 1;
    const lastTickExclusive = startTick === endTick ? startTick + 1 : endTick;
    const lastBar = Math.max(1, Math.ceil(lastTickExclusive / barTicks));

    return {
      chordCount: Number(countMatch[1]),
      startTick,
      endTick,
      firstBar,
      lastBar,
    };
  }
}
