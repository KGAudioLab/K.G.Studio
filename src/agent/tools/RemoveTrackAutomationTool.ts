import { BaseTool, type ToolParameter, type ToolResult } from './BaseTool';
import { AUTOMATION_TYPES, type AutomationType } from './automationToolTypes';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import {
  NO_MIDI_TARGET_RAW_MESSAGE,
  getTrackDisplayName,
  resolveActiveOrSelectedMidiRegionContext,
  resolveMidiTrackByIdOrName,
} from './toolTargeting';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { DeleteTrackAutomationPointsCommand } from '../../core/commands/track/DeleteTrackAutomationPointsCommand';
import { DeleteMidiEventsCommand } from '../../core/commands/note/DeleteMidiEventsCommand';

export class RemoveTrackAutomationTool extends BaseTool {
  readonly name = 'remove_track_automation';
  readonly description = 'Remove existing MIDI automation keypoints in [position, position + length), using absolute integer ticks (960 per quarter note). Advanced Mode only. Volume/pan are track-level; pitch_bend and CCs are region-level. Explicit track_id takes precedence over track_name, without invalid-ID fallback; duplicate exact names use the first MIDI match. With an explicit track, region automation is removed across all its MIDI regions. Without identifiers, use the active/selected MIDI region only for pitch bend/CCs, or its owning track for volume/pan. Remove only matching keypoints: preserve other lanes, notes, region geometry and base mix settings; add no boundary points. Empty matches succeed with zero removals and no undo entry.';
  readonly parameters: Record<string, ToolParameter> = {
    track_id: {
      type: 'string', required: false,
      description: 'Optional target MIDI track ID, preferred over track_name. An invalid ID fails without name fallback. Region-level removal covers all MIDI regions on this track.',
    },
    track_name: {
      type: 'string', required: false,
      description: 'Optional exact MIDI track name, used only when track_id is omitted. Duplicate names use the first MIDI match. Without either identifier, use the active/selected MIDI region and its owning track.',
    },
    automation_type: {
      type: 'string', required: true, enum: [...AUTOMATION_TYPES],
      description: 'Automation lane to remove: volume/pan are track-level; pitch_bend and cc1/cc2/cc7/cc11/cc64 are region-level. Other lanes are preserved.',
    },
    position: {
      type: 'number', required: true, minimum: 0,
      description: 'Absolute nonnegative integer start tick, inclusive (960 ticks per quarter note). Not relative to a region.',
    },
    length: {
      type: 'number', required: true, minimum: 1,
      description: 'Positive integer duration in ticks. Remove points in [position, position + length); the end is exclusive. length=1 targets one exact integer tick. Zero, fractional, and nonfinite lengths are rejected.',
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
    const position = normalized.position as number;
    const length = normalized.length as number;
    if (!AUTOMATION_TYPES.includes(type)) throw new Error('Unsupported automation_type.');
    if (!Number.isFinite(position) || !Number.isInteger(position) || position < 0) {
      throw new Error('position must be a finite nonnegative integer tick.');
    }
    if (!Number.isFinite(length) || !Number.isInteger(length) || length <= 0) {
      throw new Error('length must be a finite positive integer duration in ticks.');
    }
    const end = position + length;
    if (!Number.isFinite(end)) throw new Error('position + length must be finite.');
    const trackId = normalized.track_id as string | undefined;
    const trackName = normalized.track_name as string | undefined;
    const explicitTrack = Boolean(trackId || trackName);
    const selectedRegion = explicitTrack ? null : resolveActiveOrSelectedMidiRegionContext();
    const track = explicitTrack ? resolveMidiTrackByIdOrName(trackId, trackName) : selectedRegion?.track;
    if (!track) throw new Error(explicitTrack ? 'Target track not found or is not a MIDI track.' : NO_MIDI_TARGET_RAW_MESSAGE);
    const inRange = (tick: number) => tick >= position && tick < end;
    const trackLevel = type === 'volume' || type === 'pan';
    const ids = trackLevel
      ? track.getAutomationPoints(type).filter(point => inRange(point.getTick())).map(point => point.getId())
      : (selectedRegion ? [selectedRegion.region] : track.getRegions().filter((region): region is KGMidiRegion => region instanceof KGMidiRegion))
        .flatMap(region => {
          const points = type === 'pitch_bend' ? region.getPitchBends() : region.getControllerEvents(Number(type.slice(2)));
          return points.filter(point => inRange(region.getStartTick() + point.getTick())).map(point => point.getId());
        });
    const location = `track **${getTrackDisplayName(track)}**${!trackLevel && selectedRegion ? `, region **${selectedRegion.region.getName()}**` : !trackLevel ? ', all MIDI regions' : ''}`;
    return { type, position, length, end, track, ids, location };
  }

  override buildConfirmationContent(args: Record<string, unknown> | null): string | undefined {
    if (!args) return undefined;
    try {
      const { type, position, end, ids, location } = this.resolve(args);
      return `Allow removing **${ids.length} ${type} automation keypoints** in ticks **[${position}, ${end})** from ${location}?`;
    } catch { return undefined; }
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const { type, position, length, end, track, ids, location } = this.resolve(params);
      if (ids.length) {
        await this.executeCommand(type === 'volume' || type === 'pan'
          ? new DeleteTrackAutomationPointsCommand(track.getId(), type, ids)
          : type === 'pitch_bend'
            ? new DeleteMidiEventsCommand([], ids)
            : new DeleteMidiEventsCommand([], [], ids));
      }
      return this.createSuccessResult(`Removed ${ids.length} ${type} automation keypoints from ${location}; track_id=${track.getId()}, position=${position}, length=${length}, range=[${position}, ${end})${ids.length ? '.' : '; no changes applied.'}`);
    } catch (error) {
      return this.createErrorResult(`Failed to remove track automation: ${error}`);
    }
  }
}
