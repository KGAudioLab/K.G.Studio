import { UpdateTrackCommand } from '../../core/commands/track/UpdateTrackCommand';
import { BaseTool, type ToolParameter, type ToolResult } from './BaseTool';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import { getTrackDisplayName, resolveMidiTrackByIdOrName } from './toolTargeting';

/** Shared targeting, validation, and command execution for base mix settings. */
export abstract class UpdateTrackMixTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, ToolParameter>;

  protected constructor(private readonly setting: 'volume' | 'pan', private readonly minimum: number, private readonly maximum: number) {
    super();
    this.name = `update_track_${setting}`;
    const units = setting === 'volume'
      ? 'Volume is in dB units; provide only a number, without a dB suffix. The minimum is the silence floor.'
      : '-1 is fully left, 0 is center, and 1 is fully right.';
    this.description = `Set the saved base ${setting} of a MIDI track, preserving automation (which overrides the base setting during playback). Provide track_id (preferred) or track_name; no selection fallback. ID takes precedence, and duplicate names use the first exact MIDI match. ${units}`;
    this.parameters = {
      track_id: {
        type: 'string',
        description: 'Target MIDI track ID (preferred). At least one nonempty track_id or track_name is required.',
        required: false,
      },
      track_name: {
        type: 'string',
        description: 'Exact MIDI track name, used only when track_id is omitted. Duplicate names use the first matching MIDI track.',
        required: false,
      },
      value: {
        type: 'number',
        description: `Finite base ${setting} value in [${minimum}, ${maximum}], inclusive. Decimals are allowed; out-of-range values return an error. ${units}`,
        minimum,
        maximum,
        required: true,
      },
    };
  }

  override isReadOnlyTool(): boolean { return false; }
  override isAvailableInEfficientMode(): boolean { return false; }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args || !this.isValidValue(args.value)) return undefined;
    const normalized = normalizeOptionalTrackIdParam(args);
    const target = typeof normalized.track_id === 'string' && normalized.track_id
      ? `track ID **${normalized.track_id}**`
      : typeof normalized.track_name === 'string' && normalized.track_name
        ? `track **${normalized.track_name}**` : null;
    if (!target) return undefined;
    return `Allow setting base ${this.setting} to **${args.value}${this.setting === 'volume' ? ' dB' : ''}** on ${target}?`;
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const normalized = normalizeOptionalTrackIdParam(params);
      this.validateParameters(normalized);
      const value = normalized.value;
      if (!this.isValidValue(value)) {
        return this.createErrorResult(`value must be a finite number in [${this.minimum}, ${this.maximum}] for track ${this.setting}.`);
      }
      const trackId = normalized.track_id as string | undefined;
      const trackName = normalized.track_name as string | undefined;
      if (!trackId && !trackName) return this.createErrorResult('Either track_id or track_name must be provided.');
      const track = resolveMidiTrackByIdOrName(trackId, trackName);
      if (!track) {
        return this.createErrorResult(trackId
          ? `Track with ID "${trackId}" not found or is not a MIDI track.`
          : `Track with name "${trackName}" not found or is not a MIDI track.`);
      }
      const current = this.setting === 'volume' ? track.getVolume() : track.getPan();
      if (current !== value) {
        await this.executeCommand(new UpdateTrackCommand(track.getId(), { [this.setting]: value }));
      }
      return this.createSuccessResult([
        current === value ? `Track ${this.setting} already set; no changes applied:` : `Track ${this.setting} updated:`,
        `track_id: ${track.getId()}`,
        `track_name: ${getTrackDisplayName(track)}`,
        `value: ${value}`,
      ].join('\n'));
    } catch (error) {
      return this.createErrorResult(`Failed to update track ${this.setting}: ${error}`);
    }
  }

  private isValidValue(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= this.minimum && value <= this.maximum;
  }
}
