import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { listAvailableInstrumentsByGroup } from './toolTargeting';

export class ListAllAvailableInstrumentsTool extends BaseTool {
  readonly name = 'list_all_available_instruments';
  readonly description =
    'List all available instruments grouped by English instrument family names. Use this before creating a new MIDI track or changing a track instrument, because write tools require the exact English instrument name from this list.';

  readonly parameters: Record<string, ToolParameter> = {};

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  override buildToolResultDisplayContent(_args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!toolResult.success) {
      return undefined;
    }

    const totalInstruments = listAvailableInstrumentsByGroup()
      .reduce((count, group) => count + group.instruments.length, 0);
    return `Listed ${totalInstruments} available instruments.`;
  }

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const result = listAvailableInstrumentsByGroup()
        .map(({ groupName, instruments }) => [
          `Group: ${groupName}`,
          ...instruments.map(instrument => `- ${instrument}`),
        ].join('\n'))
        .join('\n\n');

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to list available instruments: ${error}`);
    }
  }
}
