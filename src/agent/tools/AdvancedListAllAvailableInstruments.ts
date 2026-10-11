import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { listAvailableInstrumentsByGroup } from './toolTargeting';
import {
  ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_SCHEMA,
  ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE,
  describeReaderResponse,
} from './advancedReaderResponses';

export type AdvancedListAllAvailableInstrumentsPayload = {
  groups: Array<{ group_name: string; instruments: string[] }>;
};

export class AdvancedListAllAvailableInstruments extends BaseTool<AdvancedListAllAvailableInstrumentsPayload> {
  readonly name = 'list_all_available_instruments';
  readonly description = describeReaderResponse(
    'List all available instruments as structured JSON grouped by English instrument family name, including enabled custom instruments. Preserves catalog order and empty groups. Use the exact returned instrument name strings with create_new_track or update_track.',
    ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_SCHEMA,
    ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE,
  );
  readonly parameters: Record<string, ToolParameter> = {};

  override isAvailableInRegularMode(): boolean { return false; }
  override isAvailableInEfficientMode(): boolean { return false; }
  override isAvailableInAdvancedMode(): boolean { return true; }

  override buildToolResultDisplayContent(
    _args: Record<string, unknown> | null,
    toolResult: ToolResult<AdvancedListAllAvailableInstrumentsPayload>,
  ): string | undefined {
    if (!toolResult.success || typeof toolResult.result === 'string') return undefined;
    const count = toolResult.result.groups.reduce((total, group) => total + group.instruments.length, 0);
    return `Listed ${count} available instruments.`;
  }

  async execute(_params: Record<string, unknown>): Promise<ToolResult<AdvancedListAllAvailableInstrumentsPayload>> {
    try {
      const groups = listAvailableInstrumentsByGroup().map(({ groupName, instruments }) => ({
        group_name: groupName,
        instruments,
      }));
      return this.createSuccessResult({ groups });
    } catch (error) {
      return this.createErrorResult(`Failed to list available instruments: ${error}`);
    }
  }
}
