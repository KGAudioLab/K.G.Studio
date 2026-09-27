import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { GlobalTrackType } from '../../core/global-track';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { findGlobalTrackByType, getSortedKeySignatureRegions } from '../../util/globalTrackUtil';
import { ticksToQuarterNotes } from '../../core/timing';

export class ReadKeySignatureTool extends BaseTool {
  readonly name = 'read_key_signature';
  readonly description = 'Read key-signature changes from the global Signature track in quarter-note units. If no regions exist, return the project-level key signature at quarter-note 0.';

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
      const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
      if (!track) {
        return this.createErrorResult('Signature global track not found');
      }

      const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
      const regions = getSortedKeySignatureRegions(track, ticksPerBar)
        .filter((region): region is KGKeySignatureRegion => region instanceof KGKeySignatureRegion);

      if (regions.length === 0) {
        return this.createSuccessResult(`[Quarter-note: 0]: ${project.getKeySignature()}`);
      }

      const result = regions
        .map(region => `[Quarter-note: ${ticksToQuarterNotes(region.getStartTick())}]: ${region.getKeySignature()}`)
        .join('\n');
      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read key signature: ${error}`);
    }
  }

  private formatMultilineResult(result: string): string {
    return result.replace(/\n/g, '  \n');
  }
}
