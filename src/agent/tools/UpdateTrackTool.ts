import { UpdateTrackCommand } from '../../core/commands/track/UpdateTrackCommand';
import { KGMidiTrack, type InstrumentType } from '../../core/track/KGMidiTrack';
import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  getEnglishInstrumentName,
  getTrackDisplayName,
  resolveInstrumentKeyByEnglishName,
  resolveMidiTrackByExactName,
  resolveMidiTrackByIdOrName,
} from './toolTargeting';

export class UpdateTrackTool extends BaseTool {
  readonly name = 'update_track';
  readonly description =
    'Update an existing MIDI track by track_id or track_name. Supports renaming the track and/or changing its instrument to an exact English instrument name from list_all_available_instruments.';

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
    instrument: {
      type: 'string',
      description: 'Optional exact English instrument name from list_all_available_instruments.',
      required: false,
    },
    new_track_name: {
      type: 'string',
      description: 'Optional new name for the track.',
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

    const normalizedInstrumentName = this.normalizeOptionalString(args.instrument);
    const normalizedNewTrackName = this.normalizeOptionalString(args.new_track_name);
    const targetLabel = typeof args.track_id === 'string'
      ? `track ID **${args.track_id}**`
      : typeof args.track_name === 'string'
        ? `track **${args.track_name}**`
        : null;
    if (!targetLabel) {
      return undefined;
    }

    const changes: string[] = [];
    if (normalizedNewTrackName !== undefined) {
      changes.push(`rename to **${normalizedNewTrackName}**`);
    }
    if (normalizedInstrumentName !== undefined) {
      changes.push(`set instrument to **${normalizedInstrumentName}**`);
    }
    if (changes.length === 0) {
      return undefined;
    }

    return `Allow updating ${targetLabel} to ${changes.join(' and ')}?`;
  }

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) {
      return undefined;
    }

    const trackIdMatch = toolResult.result.match(/track_id:\s*(\d+)/);
    const trackNameMatch = toolResult.result.match(/track_name:\s*(.+)/);
    const instrumentMatch = toolResult.result.match(/instrument:\s*(.+)/);
    if (!trackIdMatch || !trackNameMatch || !instrumentMatch) {
      return undefined;
    }

    return [
      'Track updated:',
      `- track_id: ${trackIdMatch[1]}`,
      `- track_name: ${trackNameMatch[1]}`,
      `- instrument: ${instrumentMatch[1]}`,
    ].join('\n');
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const trackId = params.track_id as string | undefined;
      const trackName = params.track_name as string | undefined;
      const instrumentName = this.normalizeOptionalString(params.instrument);
      const newTrackName = this.normalizeOptionalString(params.new_track_name);

      if (!trackId && !trackName) {
        return this.createErrorResult('Either track_id or track_name must be provided.');
      }

      if (instrumentName === undefined && newTrackName === undefined) {
        return this.createErrorResult('At least one of instrument or new_track_name must be provided.');
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
          `Track "${getTrackDisplayName(resolvedTrack)}" is not a MIDI track.`,
        );
      }

      let instrumentKey: InstrumentType | undefined;
      if (instrumentName !== undefined) {
        const resolvedInstrumentKey = resolveInstrumentKeyByEnglishName(instrumentName);
        if (resolvedInstrumentKey === null) {
          return this.createErrorResult(`Invalid instrument "${instrumentName}". Use the exact English name from list_all_available_instruments.`);
        }
        instrumentKey = resolvedInstrumentKey;
      }

      const trackNameChanged = newTrackName !== undefined && newTrackName !== resolvedTrack.getName();
      const instrumentChanged = instrumentKey !== undefined && instrumentKey !== resolvedTrack.getInstrument();

      if (!trackNameChanged && !instrumentChanged) {
        return this.createErrorResult('No changes to apply to the target track.');
      }

      const command = new UpdateTrackCommand(resolvedTrack.getId(), {
        ...(trackNameChanged ? { name: newTrackName } : {}),
        ...(instrumentChanged && instrumentKey !== undefined ? { instrument: instrumentKey } : {}),
      });
      await this.executeCommand(command);

      return this.createSuccessResult([
        'Track updated:',
        `track_id: ${resolvedTrack.getId().toString()}`,
        `track_name: ${resolvedTrack.getName()}`,
        `instrument: ${getEnglishInstrumentName(resolvedTrack.getInstrument())}`,
      ].join('\n'));
    } catch (error) {
      return this.createErrorResult(`Failed to update track: ${error}`);
    }
  }

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    return value === '' ? undefined : value;
  }
}
