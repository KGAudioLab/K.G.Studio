import { BaseTool, type ToolParameter, type ToolResult } from './BaseTool';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import { resolveMidiRegionTarget, type ResolvedRegionContext } from './midiRegionTargeting';
import { NO_MIDI_TARGET_RAW_MESSAGE, getTrackDisplayName, resolveActiveOrSelectedMidiRegionContext, resolveMidiTrackByIdOrName } from './toolTargeting';
import { KGCommand } from '../../core/commands/KGCommand';
import { CreateRegionCommand } from '../../core/commands/region/CreateRegionCommand';
import { ResizeRegionCommand } from '../../core/commands/region/ResizeRegionCommand';
import { CreateTrackAutomationPointsCommand } from '../../core/commands/track/CreateTrackAutomationPointsCommand';
import { UpdateTrackAutomationPointsCommand } from '../../core/commands/track/UpdateTrackAutomationPointsCommand';
import { CreateMidiEventsCommand } from '../../core/commands/note/CreateMidiEventsCommand';
import { UpdatePitchBendPropertiesCommand } from '../../core/commands/note/UpdatePitchBendPropertiesCommand';
import { UpdateControllerEventPropertiesCommand } from '../../core/commands/note/UpdateControllerEventPropertiesCommand';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { signedPitchBendToMidiValue } from '../../util/midiUtil';
import { ticksPerBar } from '../../core/timing';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

import { AUTOMATION_TYPES, type AutomationType } from './automationToolTypes';
const VALUE_DESCRIPTION = 'Finite value: volume [-60, 12] dB (decimals allowed); pan [-1, 1] (decimals allowed, -1 left, 0 center, 1 right); pitch_bend integer [-8192, 8191] (0 center); cc1/cc2/cc7/cc11 integer [0, 127]; cc64 exactly 0 (off) or 127 (on). Invalid values return an error without clamping or rounding.';

/** Region preparation and event upsert form a single undo entry. */
class AutomateResolvedRegionCommand extends KGCommand {
  private readonly createRegion: CreateRegionCommand | null;
  private resizeRegion: ResizeRegionCommand | null = null;
  private eventCommand: KGCommand | null = null;

  constructor(private readonly context: ResolvedRegionContext, private readonly type: AutomationType, private readonly position: number, private readonly value: number) {
    super();
    this.createRegion = context.createdRegion ? new CreateRegionCommand(
      context.track.getId().toString(), context.track.getTrackIndex(),
      context.finalRegionStartTick, context.finalRegionLength, context.regionName,
    ) : null;
  }

  execute(): void {
    const completed: KGCommand[] = [];
    try {
      if (this.createRegion) {
        this.createRegion.execute();
        completed.push(this.createRegion);
      }
      const regionId = this.createRegion?.getRegionId() ?? this.context.regionId;
      const region = this.context.track.getRegions().find(candidate => candidate.getId() === regionId);
      if (!(region instanceof KGMidiRegion)) throw new Error('Unable to resolve MIDI region.');
      // Recreate resize snapshots on redo, before the event command runs.
      this.resizeRegion = null;
      if (region.getStartTick() !== this.context.finalRegionStartTick || region.getLengthTicks() !== this.context.finalRegionLength) {
        this.resizeRegion = new ResizeRegionCommand(region.getId(), this.context.finalRegionStartTick, this.context.finalRegionLength);
        this.resizeRegion.execute();
        completed.push(this.resizeRegion);
      }
      const tick = this.position - region.getStartTick();
      if (!this.eventCommand) {
        if (this.type === 'pitch_bend') {
          const points = region.getPitchBends().filter(point => point.getTick() === tick);
          this.eventCommand = points.length
            ? new UpdatePitchBendPropertiesCommand(region.getId(), points.map(point => ({ pitchBendId: point.getId(), tick, value: point.getValue() })), points.map(point => ({ pitchBendId: point.getId(), value: this.value })))
            : new CreateMidiEventsCommand([], [{ regionId: region.getId(), tick, value: this.value }]);
        } else {
          const controller = Number(this.type.slice(2));
          const points = region.getControllerEvents(controller).filter(point => point.getTick() === tick);
          this.eventCommand = points.length
            ? new UpdateControllerEventPropertiesCommand(region.getId(), points.map(point => ({ controllerEventId: point.getId(), controller, tick, value: point.getValue() })), points.map(point => ({ controllerEventId: point.getId(), value: this.value })))
            : new CreateMidiEventsCommand([], [], [{ regionId: region.getId(), controller, tick, value: this.value }]);
        }
      }
      this.eventCommand.execute();
    } catch (error) {
      completed.reverse().forEach(command => command.undo());
      throw error;
    }
  }

  undo(): void {
    this.eventCommand?.undo();
    this.resizeRegion?.undo();
    this.createRegion?.undo();
  }

  getDescription(): string { return `Update ${this.type} automation`; }
}

export class UpdateTrackAutomationTool extends BaseTool {
  readonly name = 'update_track_automation';
  readonly description = `Upsert a single MIDI track automation point at an absolute integer tick (960 ticks per quarter note). Advanced Mode only. Volume and pan belong to the track; pitch_bend and CCs belong to a MIDI region. ID takes precedence over name; exact duplicate names use the first MIDI match. Omitted identifiers use the active/selected MIDI region's track. Region automation selects an overlapping region or creates a one-bar region starting at position; an active/selected region is expanded as needed. Existing points of the same type at position are updated; unchanged values create no undo entry. ${VALUE_DESCRIPTION}`;
  readonly parameters: Record<string, ToolParameter> = {
    track_id: { type: 'string', description: 'Optional MIDI track ID, preferred over track_name. An invalid ID fails without name fallback.', required: false },
    track_name: { type: 'string', description: 'Optional exact MIDI track name, used only when track_id is omitted. Duplicate names use the first MIDI match. Without either identifier, use the active/selected MIDI region.', required: false },
    automation_type: { type: 'string', description: 'Automation lane to update. Volume/pan are track-level; pitch_bend and CC lanes are region-level.', enum: [...AUTOMATION_TYPES], required: true },
    position: { type: 'number', description: 'Absolute nonnegative integer tick on the project timeline (960 ticks per quarter note), not relative to the region.', minimum: 0, required: true },
    value: { type: 'number', description: VALUE_DESCRIPTION, required: true },
  };

  override isReadOnlyTool(): boolean { return false; }
  override isAvailableInRegularMode(): boolean { return false; }
  override isAvailableInEfficientMode(): boolean { return false; }
  override isAvailableInAdvancedMode(): boolean { return true; }

  private resolve(params: Record<string, unknown>) {
    const normalized = normalizeOptionalTrackIdParam(params);
    this.validateParameters(normalized);
    const type = normalized.automation_type as AutomationType;
    const position = normalized.position as number;
    const value = normalized.value as number;
    if (!AUTOMATION_TYPES.includes(type)) throw new Error('Unsupported automation_type.');
    if (!Number.isInteger(position) || position < 0 || !Number.isFinite(position)) throw new Error('position must be a finite nonnegative integer tick.');
    const minimum = type === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB : type === 'pan' ? -1 : type === 'pitch_bend' ? -8192 : 0;
    const maximum = type === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB : type === 'pan' ? 1 : type === 'pitch_bend' ? 8191 : 127;
    if (!Number.isFinite(value) || value < minimum || value > maximum
      || (type !== 'volume' && type !== 'pan' && !Number.isInteger(value))
      || (type === 'cc64' && value !== 0 && value !== 127)) throw new Error(VALUE_DESCRIPTION);
    const trackId = normalized.track_id as string | undefined;
    const trackName = normalized.track_name as string | undefined;
    const track = trackId || trackName
      ? resolveMidiTrackByIdOrName(trackId, trackName)
      : resolveActiveOrSelectedMidiRegionContext()?.track;
    if (!track) throw new Error(trackId || trackName ? 'Target track not found or is not a MIDI track.' : NO_MIDI_TARGET_RAW_MESSAGE);
    const context = type === 'volume' || type === 'pan' ? null : resolveMidiRegionTarget(trackId, trackName, { startTick: position, endTick: position + 1 }, ticksPerBar(this.getCurrentProject().getTimeSignature()));
    if (type !== 'volume' && type !== 'pan' && !context) throw new Error(NO_MIDI_TARGET_RAW_MESSAGE);
    return { type, position, value, track, context };
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) return undefined;
    try {
      const { type, position, value, track, context } = this.resolve(args);
      return `Allow setting **${type}** automation to **${value}** at tick **${position}** on track **${getTrackDisplayName(track)}**${context ? ` in ${context.createdRegion ? 'new ' : ''}region **${context.regionName}**` : ''}?`;
    } catch { return undefined; }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { type, position, value, track, context } = this.resolve(params);
      const storedValue = type === 'pitch_bend' ? signedPitchBendToMidiValue(value) : value;
      let changed: boolean;
      if (type === 'volume' || type === 'pan') {
        const points = track.getAutomationPoints(type).filter(point => point.getTick() === position);
        changed = !points.length || points.some(point => point.getValue() !== storedValue);
        if (changed) await this.executeCommand(points.length
          ? new UpdateTrackAutomationPointsCommand(track.getId(), type, points.map(point => ({ pointId: point.getId(), tick: position, value: point.getValue() })), points.map(point => ({ pointId: point.getId(), value: storedValue })))
          : new CreateTrackAutomationPointsCommand(track.getId(), type, [{ tick: position, value: storedValue }]));
      } else {
        const target = context!;
        const region = track.getRegions().find(candidate => candidate.getId() === target.regionId) as KGMidiRegion | undefined;
        const points = region ? (type === 'pitch_bend' ? region.getPitchBends() : region.getControllerEvents(Number(type.slice(2))))
          .filter(point => point.getTick() + region.getStartTick() === position) : [];
        changed = !points.length || points.some(point => point.getValue() !== storedValue) || !region
          || region.getStartTick() !== target.finalRegionStartTick || region.getLengthTicks() !== target.finalRegionLength;
        if (changed) await this.executeCommand(new AutomateResolvedRegionCommand(target, type, position, storedValue));
      }
      return this.createSuccessResult(`${changed ? 'Updated automation' : 'Automation already matches; no changes applied'}: track_id=${track.getId()}, track_name=${getTrackDisplayName(track)}${context ? `, region_name=${context.regionName}` : ''}, automation_type=${type}, position=${position}, value=${value}`);
    } catch (error) {
      return this.createErrorResult(`Failed to update track automation: ${error}`);
    }
  }
}
