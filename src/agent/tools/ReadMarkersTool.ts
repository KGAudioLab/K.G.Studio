import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { GlobalTrackType } from '../../core/global-track';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';

export class ReadMarkersTool extends BaseTool {
  readonly name = 'read_markers';
  readonly description = 'Read marker annotations from the global Marker track. Marker regions are timeline annotations only and do not affect playback.';

  readonly parameters: Record<string, ToolParameter> = {};

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return this.formatMultilineResult(toolResult.result);
  }

  override buildToolHistoryContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    return toolResult.result;
  }

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const project = this.getCurrentProject();
      const track = findGlobalTrackByType(project, GlobalTrackType.Marker);
      if (!track) {
        return this.createErrorResult('Marker global track not found');
      }

      const regions = track.getRegions()
        .filter((region): region is KGMarkerRegion => region instanceof KGMarkerRegion)
        .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

      if (regions.length === 0) {
        return this.createSuccessResult('No marker regions found on the global Marker track.');
      }

      const result = regions
        .map(region => `[Beat: ${region.getStartFromBeat()}; Length: ${region.getLength()}]: ${region.getName()}`)
        .join('\n');
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read markers: ${error}`);
    }
  }

  private formatMultilineResult(result: string): string {
    return result.replace(/\n/g, '  \n');
  }
}
