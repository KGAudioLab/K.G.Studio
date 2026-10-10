import { BaseTool, type ToolParameter, type ToolResult } from './BaseTool';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import { resolveMidiRegionTarget, type ResolvedRegionContext } from './midiRegionTargeting';
import { NO_MIDI_TARGET_RAW_MESSAGE, getTrackDisplayName, resolveActiveOrSelectedMidiRegionContext, resolveMidiTrackByIdOrName } from './toolTargeting';
import { KGCore } from '../../core/KGCore';
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
        completed.push(this.createRegion);
        this.createRegion.execute();
      }
      const regionId = this.createRegion?.getRegionId() ?? this.context.regionId;
      const region = this.context.track.getRegions().find(candidate => candidate.getId() === regionId);
      if (!(region instanceof KGMidiRegion)) throw new Error('Unable to resolve MIDI region.');
      // Recreate resize snapshots on redo, before the event command runs.
      this.resizeRegion = null;
      if (region.getStartTick() !== this.context.finalRegionStartTick || region.getLengthTicks() !== this.context.finalRegionLength) {
        this.resizeRegion = new ResizeRegionCommand(region.getId(), this.context.finalRegionStartTick, this.context.finalRegionLength);
        completed.push(this.resizeRegion);
        this.resizeRegion.execute();
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
      completed.push(this.eventCommand);
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

interface AutomationKeypoint {
  position: number;
  value: number;
}

/** Resolve each point after earlier edits, but retain commands and IDs for redo. */
class BulkAutomationCommand extends KGCommand {
  private commands: KGCommand[] | null = null;

  constructor(private readonly type: AutomationType, private readonly keypoints: AutomationKeypoint[], private readonly createCommand: (point: AutomationKeypoint) => KGCommand | null, private readonly restoreFailedEdit: () => void) {
    super();
  }

  execute(): void {
    const completed: KGCommand[] = [];
    const commands = this.commands ?? [];
    try {
      if (this.commands) {
        for (const command of commands) {
          command.execute();
          completed.push(command);
        }
      } else {
        for (const point of this.keypoints) {
          const command = this.createCommand(point);
          if (!command) continue;
          command.execute();
          completed.push(command);
          commands.push(command);
        }
        this.commands = commands;
      }
    } catch (error) {
      completed.reverse().forEach(command => command.undo());
      this.restoreFailedEdit();
      throw error;
    }
  }

  undo(): void {
    [...(this.commands ?? [])].reverse().forEach(command => command.undo());
  }

  getDescription(): string { return `Update ${this.keypoints.length} ${this.type} automation keypoints`; }
}

export class UpdateTrackAutomationTool extends BaseTool {
  readonly name = 'update_track_automation';
  readonly description = `Upsert a nonempty array of MIDI track automation keypoints at absolute integer ticks (960 ticks per quarter note). Advanced Mode only. Validate every input before editing; repeated positions use the last value, then points are applied in ascending tick order. The whole batch is atomic and forms one undo entry; unchanged batches create no undo entry. Volume and pan belong to the track; pitch_bend and CCs belong to MIDI regions. ID takes precedence over name; exact duplicate names use the first MIDI match. Omitted identifiers use the active/selected MIDI region's track. Resolve a region separately for each position, reusing regions created earlier in the batch: select an overlapping region or create a one-bar region starting at position; an active/selected region is expanded as needed. Existing points of the same type at each position are updated. ${VALUE_DESCRIPTION}`;
  readonly parameters: Record<string, ToolParameter> = {
    track_id: { type: 'string', description: 'Optional MIDI track ID, preferred over track_name. An invalid ID fails without name fallback.', required: false },
    track_name: { type: 'string', description: 'Optional exact MIDI track name, used only when track_id is omitted. Duplicate names use the first MIDI match. Without either identifier, use the active/selected MIDI region.', required: false },
    automation_type: { type: 'string', description: 'Automation lane to update. Volume/pan are track-level; pitch_bend and CC lanes are region-level.', enum: [...AUTOMATION_TYPES], required: true },
    keypoints: {
      type: 'array', required: true,
      description: 'Nonempty array of automation keypoints. Every entry must be valid; the last value wins at repeated positions. Applied in ascending tick order as one atomic undoable operation.',
      items: {
        type: 'object', description: 'An automation keypoint.',
        properties: {
          position: { type: 'number', description: 'Absolute nonnegative integer tick on the project timeline (960 ticks per quarter note), not relative to the region.', minimum: 0, required: true },
          value: { type: 'number', description: VALUE_DESCRIPTION, required: true },
        },
      },
    },
  };

  override isReadOnlyTool(): boolean { return false; }
  override isAvailableInRegularMode(): boolean { return false; }
  override isAvailableInEfficientMode(): boolean { return false; }
  override isAvailableInAdvancedMode(): boolean { return true; }

  private resolve(params: Record<string, unknown>) {
    const normalized = normalizeOptionalTrackIdParam(params);
    this.validateParameters(normalized);
    const type = normalized.automation_type as AutomationType;
    if (!AUTOMATION_TYPES.includes(type)) throw new Error('Unsupported automation_type.');
    const input = normalized.keypoints as AutomationKeypoint[];
    if (!input.length) throw new Error('keypoints must contain at least one point.');
    const minimum = type === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB : type === 'pan' ? -1 : type === 'pitch_bend' ? -8192 : 0;
    const maximum = type === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB : type === 'pan' ? 1 : type === 'pitch_bend' ? 8191 : 127;
    const byPosition = new Map<number, AutomationKeypoint>();
    for (const [index, { position, value }] of input.entries()) {
      if (!Number.isInteger(position) || position < 0 || !Number.isFinite(position)) throw new Error(`keypoints[${index}].position must be a finite nonnegative integer tick.`);
      if (!Number.isFinite(value) || value < minimum || value > maximum
        || (type !== 'volume' && type !== 'pan' && !Number.isInteger(value))
        || (type === 'cc64' && value !== 0 && value !== 127)) throw new Error(`keypoints[${index}]: ${VALUE_DESCRIPTION}`);
      byPosition.set(position, { position, value });
    }
    const keypoints = [...byPosition.values()].sort((a, b) => a.position - b.position);
    const trackId = normalized.track_id as string | undefined;
    const trackName = normalized.track_name as string | undefined;
    const track = trackId || trackName
      ? resolveMidiTrackByIdOrName(trackId, trackName)
      : resolveActiveOrSelectedMidiRegionContext()?.track;
    if (!track) throw new Error(trackId || trackName ? 'Target track not found or is not a MIDI track.' : NO_MIDI_TARGET_RAW_MESSAGE);
    const createCommand = ({ position, value }: AutomationKeypoint): KGCommand | null => {
      const storedValue = type === 'pitch_bend' ? signedPitchBendToMidiValue(value) : value;
      if (type === 'volume' || type === 'pan') {
        const points = track.getAutomationPoints(type).filter(point => point.getTick() === position);
        if (points.length && points.every(point => point.getValue() === storedValue)) return null;
        return points.length
          ? new UpdateTrackAutomationPointsCommand(track.getId(), type, points.map(point => ({ pointId: point.getId(), tick: position, value: point.getValue() })), points.map(point => ({ pointId: point.getId(), value: storedValue })))
          : new CreateTrackAutomationPointsCommand(track.getId(), type, [{ tick: position, value: storedValue }]);
      }
      const target = resolveMidiRegionTarget(trackId, trackName, { startTick: position, endTick: position + 1 }, ticksPerBar(this.getCurrentProject().getTimeSignature()));
      if (!target) throw new Error(NO_MIDI_TARGET_RAW_MESSAGE);
      const region = track.getRegions().find(candidate => candidate.getId() === target.regionId) as KGMidiRegion | undefined;
      const points = region ? (type === 'pitch_bend' ? region.getPitchBends() : region.getControllerEvents(Number(type.slice(2))))
        .filter(point => point.getTick() + region.getStartTick() === position) : [];
      if (points.length && points.every(point => point.getValue() === storedValue) && region
        && region.getStartTick() === target.finalRegionStartTick && region.getLengthTicks() === target.finalRegionLength) return null;
      return new AutomateResolvedRegionCommand(target, type, position, storedValue);
    };
    return { type, keypoints, track, createCommand };
  }

  override buildToolResultDisplayContent(args: Record<string, unknown> | null, toolResult: ToolResult): string | undefined {
    if (!args || !toolResult.success) return undefined;
    try {
      const { type, keypoints, track } = this.resolve(args);
      if (toolResult.result.startsWith('Automation already matches; no changes applied')) {
        return `The automation already matches on track **${getTrackDisplayName(track)}**; no changes applied.`;
      }
      const labels: Record<AutomationType, string> = {
        volume: 'volume', pan: 'pan', pitch_bend: 'pitch bend',
        cc1: 'modulation', cc2: 'breath', cc7: 'MIDI volume', cc11: 'expression', cc64: 'sustain',
      };
      return `Updated ${keypoints.length} ${labels[type]} ${keypoints.length === 1 ? 'keypoint' : 'keypoints'} on track **${getTrackDisplayName(track)}**.`;
    } catch { return undefined; }
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) return undefined;
    try {
      const { type, keypoints, track } = this.resolve(args);
      return `Allow updating **${keypoints.length} ${type} automation keypoints** on track **${getTrackDisplayName(track)}** in ticks **[${keypoints[0].position}, ${keypoints[keypoints.length - 1].position}]**?`;
    } catch { return undefined; }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { type, keypoints, track, createCommand } = this.resolve(params);
      // Inspect all points without mutation so a matching batch preserves undo/redo history.
      const changed = keypoints.map(createCommand).some(command => command !== null);
      if (changed) {
        // Track commands can throw after changing the lane; restore its original points too.
        const originalPoints = type === 'volume' || type === 'pan' ? [...track.getAutomationPoints(type)] : null;
        const restoreFailedEdit = () => {
          if (originalPoints && (type === 'volume' || type === 'pan')) track.setAutomationPoints(type, originalPoints);
        };
        KGCore.instance().executeCommand(new BulkAutomationCommand(type, keypoints, createCommand, restoreFailedEdit), { rethrow: true });
      }
      return this.createSuccessResult(`${changed ? 'Updated automation' : 'Automation already matches; no changes applied'}: track_id=${track.getId()}, track_name=${getTrackDisplayName(track)}, automation_type=${type}, keypoint_count=${keypoints.length}, tick_range=[${keypoints[0].position}, ${keypoints[keypoints.length - 1].position}], keypoints=${JSON.stringify(keypoints)}`);
    } catch (error) {
      return this.createErrorResult(`Failed to update track automation: ${error}`);
    }
  }
}
