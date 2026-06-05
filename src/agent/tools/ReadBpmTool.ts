import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { GlobalTrackType } from '../../core/global-track';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { findGlobalTrackByType, getSortedTempoRegions } from '../../util/globalTrackUtil';

export class ReadBpmTool extends BaseTool {
  readonly name = 'read_bpm';
  readonly description = 'Read the BPM changes from the global Tempo track. If no tempo regions exist, fall back to the project-level BPM and return it at beat 0.';

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
      const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
      if (!track) {
        return this.createErrorResult('Tempo global track not found');
      }

      const beatsPerBar = project.getTimeSignature().numerator;
      const regions = getSortedTempoRegions(track, beatsPerBar)
        .filter((region): region is KGTempoRegion => region instanceof KGTempoRegion);

      if (regions.length === 0) {
        return this.createSuccessResult(`[Beat: 0]: ${project.getBpm()} BPM`);
      }

      const result = regions
        .map(region => `[Beat: ${region.getStartFromBeat()}]: ${region.getBpm()} BPM`)
        .join('\n');
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read BPM: ${error}`);
    }
  }

  private formatMultilineResult(result: string): string {
    return result.replace(/\n/g, '  \n');
  }
}
