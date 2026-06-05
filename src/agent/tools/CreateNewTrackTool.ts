import { AddTrackCommand } from '../../core/commands/track/AddTrackCommand';
import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  getEnglishInstrumentName,
  resolveInstrumentKeyByEnglishName,
} from './toolTargeting';

export class CreateNewTrackTool extends BaseTool {
  readonly name = 'create_new_track';
  readonly description =
    'Create a new MIDI track with a given track name and exact English instrument name. Use list_all_available_instruments first to discover valid instrument names.';

  readonly parameters: Record<string, ToolParameter> = {
    track_name: {
      type: 'string',
      description: 'Name of the new MIDI track to create.',
      required: true,
    },
    instrument: {
      type: 'string',
      description: 'Exact English instrument name from list_all_available_instruments.',
      required: true,
    },
  };

  override isReadOnlyTool(): boolean {
    return false;
  }

  override isAvailableInEfficientMode(): boolean {
    return false;
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) {
      return undefined;
    }

    const trackName = typeof args.track_name === 'string' ? args.track_name : null;
    const instrument = typeof args.instrument === 'string' ? args.instrument : null;
    if (!trackName || !instrument) {
      return undefined;
    }

    return `Allow creating track **${trackName}** with instrument **${instrument}**?`;
  }

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) {
      return undefined;
    }

    const trackName = typeof args.track_name === 'string' ? args.track_name : null;
    const instrument = typeof args.instrument === 'string' ? args.instrument : null;
    if (!trackName || !instrument) {
      return undefined;
    }

    const trackIdMatch = toolResult.result.match(/track_id:\s*(\d+)/);
    if (!trackIdMatch) {
      return undefined;
    }

    return [
      'New track created:',
      `- track_id: ${trackIdMatch[1]}`,
      `- track_name: ${trackName}`,
      `- instrument: ${instrument}`,
    ].join('\n');
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const trackName = params.track_name as string;
      const instrumentName = params.instrument as string;
      const instrumentKey = resolveInstrumentKeyByEnglishName(instrumentName);
      if (!instrumentKey) {
        return this.createErrorResult(`Invalid instrument "${instrumentName}". Use the exact English name from list_all_available_instruments.`);
      }

      const command = new AddTrackCommand(undefined, trackName, instrumentKey);
      await this.executeCommand(command);

      return this.createSuccessResult([
        'New track created:',
        `track_id: ${command.getTrackId().toString()}`,
        `track_name: ${trackName}`,
        `instrument: ${getEnglishInstrumentName(instrumentKey)}`,
      ].join('\n'));
    } catch (error) {
      return this.createErrorResult(`Failed to create track: ${error}`);
    }
  }
}
