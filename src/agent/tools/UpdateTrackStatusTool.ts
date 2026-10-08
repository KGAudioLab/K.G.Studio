import { UpdateTrackCommand } from '../../core/commands/track/UpdateTrackCommand';
import { BaseTool, type ToolParameter, type ToolResult } from './BaseTool';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import { getTrackDisplayName, resolveMidiTrackByIdOrName } from './toolTargeting';

export class UpdateTrackStatusTool extends BaseTool {
  readonly name = 'update_track_status';
  readonly description = 'Set mute or solo on an existing MIDI track. Provide track_id (preferred) or track_name; no selection fallback. track_id takes precedence; duplicate names use the first exact matching MIDI track. true enables the status and false disables it.';

  readonly parameters: Record<string, ToolParameter> = {
    track_id: {
      type: 'string',
      description: 'Target MIDI track ID. Preferred when available. At least one of track_id or track_name is required.',
      required: false,
    },
    track_name: {
      type: 'string',
      description: 'Exact MIDI track name, used only when track_id is omitted. Duplicate names use the first matching MIDI track.',
      required: false,
    },
    status_type: {
      type: 'string',
      description: 'Track status to set: solo or mute.',
      enum: ['solo', 'mute'],
      required: true,
    },
    value: {
      type: 'boolean',
      description: 'true enables the specified status; false disables it.',
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
    if (!args) return undefined;
    const normalized = normalizeOptionalTrackIdParam(args);
    if ((normalized.status_type !== 'mute' && normalized.status_type !== 'solo') || typeof normalized.value !== 'boolean') {
      return undefined;
    }
    const target = typeof normalized.track_id === 'string' && normalized.track_id
      ? `track ID **${normalized.track_id}**`
      : typeof normalized.track_name === 'string' && normalized.track_name
        ? `track **${normalized.track_name}**`
        : null;
    if (!target) return undefined;
    return `Allow setting ${normalized.status_type} **${normalized.value ? 'on' : 'off'}** on ${target}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const normalized = normalizeOptionalTrackIdParam(params);
      this.validateParameters(normalized);
      const trackId = normalized.track_id as string | undefined;
      const trackName = normalized.track_name as string | undefined;
      const statusType = normalized.status_type;
      const value = normalized.value as boolean;

      if (!trackId && !trackName) {
        return this.createErrorResult('Either track_id or track_name must be provided.');
      }
      if (statusType !== 'mute' && statusType !== 'solo') {
        return this.createErrorResult('status_type must be "solo" or "mute".');
      }

      const track = resolveMidiTrackByIdOrName(trackId, trackName);
      if (!track) {
        return this.createErrorResult(trackId
          ? `Track with ID "${trackId}" not found or is not a MIDI track.`
          : `Track with name "${trackName}" not found or is not a MIDI track.`);
      }

      const currentValue = statusType === 'mute' ? track.getMuted() : track.getSolo();
      const unchanged = currentValue === value;
      if (!unchanged) {
        await this.executeCommand(new UpdateTrackCommand(track.getId(),
          statusType === 'mute' ? { muted: value } : { solo: value }));
      }

      return this.createSuccessResult([
        unchanged ? 'Track status already set; no changes applied:' : 'Track status updated:',
        `track_id: ${track.getId()}`,
        `track_name: ${getTrackDisplayName(track)}`,
        `status_type: ${statusType}`,
        `value: ${value}`,
      ].join('\n'));
    } catch (error) {
      return this.createErrorResult(`Failed to update track status: ${error}`);
    }
  }
}
