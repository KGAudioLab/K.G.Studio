import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { DeleteMultipleKeySignatureRegionsCommand } from '../../core/commands/global-region/DeleteKeySignatureRegionCommand';
import { GlobalTrackType } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { findGlobalTrackByType, getSortedKeySignatureRegions } from '../../util/globalTrackUtil';

interface KeySignatureRemovalSummaryData {
  regionCount: number;
  startBeat: number;
  endBeat: number;
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

      const startBeat = params.start as number;
      const endBeat = params.end as number;
      this.validateRange(startBeat, endBeat);

      const matchingRegions = this.findMatchingRegions(startBeat, endBeat);
      if (matchingRegions.length === 0) {
        return this.createSuccessResult(
          `No key-signature regions found with start beats in the requested range from beat ${startBeat} to ${endBeat}.`,
        );
      }

      await this.executeCommand(new DeleteMultipleKeySignatureRegionsCommand(matchingRegions.map(region => region.getId())));

      const details = matchingRegions
        .map(region => `"${region.getKeySignature()}" at beat ${region.getStartFromBeat()}`)
        .join(', ');
      return this.createSuccessResult(
        `Successfully removed ${matchingRegions.length} key signature ${matchingRegions.length === 1 ? 'region' : 'regions'} from the global Signature track: ${details}.`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove key signature: ${error}`);
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

  private findMatchingRegions(startBeat: number, endBeat: number): KGKeySignatureRegion[] {
    const project = this.getCurrentProject();
    const signatureTrack = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!signatureTrack) {
      return [];
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    return getSortedKeySignatureRegions(signatureTrack, beatsPerBar)
      .filter(region => this.matchesRange(region.getStartFromBeat(), startBeat, endBeat));
  }

  private matchesRange(regionStartBeat: number, startBeat: number, endBeat: number): boolean {
    if (startBeat === endBeat) {
      return regionStartBeat === startBeat;
    }

    return regionStartBeat >= startBeat && regionStartBeat < endBeat;
  }

  private buildSummaryData(args: Record<string, unknown>): KeySignatureRemovalSummaryData | null {
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
        regionCount: 0,
        startBeat: typedArgs.start,
        endBeat: typedArgs.end,
        firstBar: bar,
        lastBar: bar,
      };
    }

    const firstBeat = Math.min(...matchingRegions.map(region => region.getStartFromBeat()));
    const lastBeat = Math.max(...matchingRegions.map(region => region.getStartFromBeat() + region.getLength()));
    return {
      regionCount: matchingRegions.length,
      startBeat: typedArgs.start,
      endBeat: typedArgs.end,
      firstBar: Math.floor(firstBeat / beatsPerBar) + 1,
      lastBar: Math.max(1, Math.ceil(lastBeat / beatsPerBar)),
    };
  }
}
