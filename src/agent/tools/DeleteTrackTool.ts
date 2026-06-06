import { RemoveTrackCommand } from '../../core/commands/track/RemoveTrackCommand';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { resolveMidiTrackByExactName, resolveMidiTrackByIdOrName } from './toolTargeting';

export class DeleteTrackTool extends BaseTool {
  readonly name = 'delete_track';
  readonly description =
    'Delete an existing MIDI track by track_id or track_name. Prefer track_id because track_name may be duplicated.';

  readonly parameters: Record<string, ToolParameter> = {
    track_id: {
      type: 'string',
      description: 'Target MIDI track ID. Preferred when available.',
      required: false,
    },
    track_name: {
      type: 'string',
      description: 'Target MIDI track name. Used only when track_id is omitted.',
      required: false,
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

    if (typeof args.track_id === 'string') {
      return `Allow deleting track ID **${args.track_id}**?`;
    }

    if (typeof args.track_name === 'string') {
      return `Allow deleting track **${args.track_name}**?`;
    }

    return undefined;
  }

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) {
      return undefined;
    }

    const trackIdMatch = toolResult.result.match(/track_id:\s*(\d+)/);
    const trackNameMatch = toolResult.result.match(/track_name:\s*(.+)/);
    if (!trackIdMatch || !trackNameMatch) {
      return undefined;
    }

    return [
      'Track deleted:',
      `- track_id: ${trackIdMatch[1]}`,
      `- track_name: ${trackNameMatch[1]}`,
    ].join('\n');
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const trackId = params.track_id as string | undefined;
      const trackName = params.track_name as string | undefined;

      if (!trackId && !trackName) {
        return this.createErrorResult('Either track_id or track_name must be provided.');
      }

      if (!trackId && trackName) {
        const matchingTracks = resolveMidiTrackByExactName(trackName);
        if (matchingTracks.length > 1) {
          return this.createErrorResult(`Multiple MIDI tracks share the name "${trackName}". Provide track_id instead.`);
        }
      }

      const resolvedTrack = resolveMidiTrackByIdOrName(trackId, trackName);
      if (!resolvedTrack) {
        return this.createErrorResult(
          trackId
            ? `Track with ID "${trackId}" not found or is not a MIDI track.`
            : `Track with name "${trackName}" not found or is not a MIDI track.`,
        );
      }

      if (!(resolvedTrack instanceof KGMidiTrack)) {
        return this.createErrorResult(
          trackId
            ? `Track with ID "${trackId}" not found or is not a MIDI track.`
            : `Track with name "${trackName}" not found or is not a MIDI track.`,
        );
      }

      const deletedTrackId = resolvedTrack.getId().toString();
      const deletedTrackName = resolvedTrack.getName();
      const command = new RemoveTrackCommand(resolvedTrack.getId());
      await this.executeCommand(command);

      return this.createSuccessResult([
        'Track deleted:',
        `track_id: ${deletedTrackId}`,
        `track_name: ${deletedTrackName}`,
      ].join('\n'));
    } catch (error) {
      return this.createErrorResult(`Failed to delete track: ${error}`);
    }
  }
}
