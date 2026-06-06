import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { DeleteMultipleGlobalRegionsCommand } from '../../core/commands/global-region/DeleteGlobalRegionCommand';
import { GlobalTrackType } from '../../core/global-track';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

export class RemoveMarkersTool extends BaseTool {
  readonly name = 'remove_markers';
  readonly description = 'Remove marker annotations from the global Marker track by region start beat. This deletes whole marker regions whose start beat is in the requested range. Markers are annotations only and do not affect playback.';

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  readonly parameters: Record<string, ToolParameter> = {
    start: {
      type: 'number',
      description: 'Start beat where the removal range begins. When start is less than end, markers starting exactly at this beat are removed.',
      required: true,
    },
    end: {
      type: 'number',
      description: 'End beat where the removal range ends. When start is less than end, this value is exclusive. When start equals end, only the marker starting exactly at that beat is removed.',
      required: true,
    },
  };

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return this.formatMultilineResult(toolResult.result);
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    const typedArgs = args as { start?: number; end?: number };
    if (typeof typedArgs.start !== 'number' || typeof typedArgs.end !== 'number') {
      return undefined;
    }

    return `Allow removing marker annotations from the global Marker track in the start-beat range ${typedArgs.start} to ${typedArgs.end}?`;
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
          `No marker annotations found with start beats in the requested range from beat ${startBeat} to ${endBeat}.`,
        );
      }

      await this.executeCommand(new DeleteMultipleGlobalRegionsCommand(matchingRegions.map(region => region.getId())));

      const details = matchingRegions
        .map(region => `[Beat: ${region.getStartFromBeat()}; Length: ${region.getLength()}]: ${region.getName()}`)
        .join('\n');
      return this.createSuccessResult(
        `Successfully removed ${matchingRegions.length} marker ${matchingRegions.length === 1 ? 'annotation' : 'annotations'} from the global Marker track. Markers are annotation-only and do not affect playback.\n${details}`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to remove markers: ${error}`);
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

  private findMatchingRegions(startBeat: number, endBeat: number): KGMarkerRegion[] {
    const project = this.getCurrentProject();
    const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
    if (!markerTrack) {
      return [];
    }

    return markerTrack.getRegions()
      .filter((region): region is KGMarkerRegion => region instanceof KGMarkerRegion)
      .filter(region => this.matchesRange(region.getStartFromBeat(), startBeat, endBeat))
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());
  }

  private matchesRange(regionStartBeat: number, startBeat: number, endBeat: number): boolean {
    if (startBeat === endBeat) {
      return regionStartBeat === startBeat;
    }

    return regionStartBeat >= startBeat && regionStartBeat < endBeat;
  }

  private formatMultilineResult(result: string): string {
    return result.replace(/\n/g, '  \n');
  }
}
