import { BaseTool } from './BaseTool';
import { quarterNotesToTicks, ticksPerBar, ticksToQuarterNotes } from '../../core/timing';
import type { ToolParameter, ToolResult } from './BaseTool';
import { DeleteMultipleKeySignatureRegionsCommand } from '../../core/commands/global-region/DeleteKeySignatureRegionCommand';
import { GlobalTrackType } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { findGlobalTrackByType, getSortedKeySignatureRegions } from '../../util/globalTrackUtil';

interface KeySignatureRemovalSummaryData {
  regionCount: number;
  startTick: number;
  endTick: number;
  firstBar: number;
  lastBar: number;
}

export class RemoveKeySignatureTool extends BaseTool {
  readonly name = 'remove_key_signature';
  readonly description = 'Remove key-signature regions from the global Signature track by absolute start-beat range. This removes whole key-signature regions whose start beat falls within the requested range.';

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

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
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

    return `Allow removing ${summary.regionCount} key signature ${summary.regionCount === 1 ? 'region' : 'regions'} from the global Signature Track across ${summary.firstBar === summary.lastBar ? `bar ${summary.firstBar}` : `bars ${summary.firstBar} to ${summary.lastBar}`}?`;
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
          `No key-signature regions found in the requested quarter-note range ${ticksToQuarterNotes(startTick)} to ${ticksToQuarterNotes(endTick)}.`,
        );
      }

      await this.executeCommand(new DeleteMultipleKeySignatureRegionsCommand(matchingRegions.map(region => region.getId())));

      const details = matchingRegions
        .map(region => `"${region.getKeySignature()}" at quarter-note ${ticksToQuarterNotes(region.getStartTick())}`)
        .join(', ');
      return this.createSuccessResult(
        `Successfully removed ${matchingRegions.length} key signature ${matchingRegions.length === 1 ? 'region' : 'regions'} from the global Signature track: ${details}.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove key signature: ${error}`);
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

  private findMatchingRegions(startTick: number, endTick: number): KGKeySignatureRegion[] {
    const project = this.getCurrentProject();
    const signatureTrack = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!signatureTrack) {
      return [];
    }

    const barTicks = ticksPerBar(project.getTimeSignature());
    return getSortedKeySignatureRegions(signatureTrack, barTicks)
      .filter(region => this.matchesRange(region.getStartTick(), startTick, endTick));
  }

  private matchesRange(regionStartTick: number, startTick: number, endTick: number): boolean {
    if (startTick === endTick) {
      return regionStartTick === startTick;
    }

    return regionStartTick >= startTick && regionStartTick < endTick;
  }

  private buildSummaryData(args: Record<string, unknown>): KeySignatureRemovalSummaryData | null {
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
        regionCount: 0,
        startTick,
        endTick,
        firstBar: bar,
        lastBar: bar,
      };
    }

    const firstBeat = Math.min(...matchingRegions.map(region => region.getStartTick()));
    const lastBeat = Math.max(...matchingRegions.map(region => region.getStartTick() + region.getLengthTicks()));
    return {
      regionCount: matchingRegions.length,
      startTick,
      endTick,
      firstBar: Math.floor(firstBeat / barTicks) + 1,
      lastBar: Math.max(1, Math.ceil(lastBeat / barTicks)),
    };
  }
}
