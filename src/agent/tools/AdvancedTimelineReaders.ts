import type { StructuredToolPayload, ToolResult } from './BaseTool';
import { AdvancedReaderTool } from './advancedToolUtils';
import { findGlobalTrackByType, getSortedTempoRegions, getSortedKeySignatureRegions } from '../../util/globalTrackUtil';
import { GlobalTrackType } from '../../core/global-track';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import { TICKS_PER_QUARTER, ticksPerBar } from '../../core/timing';
import { resolveSelectedMusicRangeContext, resolveSelectedTrackContext } from './toolTargeting';

abstract class AdvancedGlobalReader extends AdvancedReaderTool {
  readonly parameters = {};
  override isAvailableInEfficientMode(): boolean { return false; }
}

export class AdvancedReadBpmTool extends AdvancedGlobalReader {
  readonly name = 'read_bpm';
  readonly description = 'Read JSON {ticks_per_quarter_note:960,bpms:[{start,bpm}]} with absolute integer tick positions. With no tempo regions, returns the project default at start 0.';
  async execute(_params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    void _params;
    try {
      const project = this.getCurrentProject();
      const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
      if (!track) return this.createErrorResult('Tempo global track not found');
      const bpms = getSortedTempoRegions(track, ticksPerBar(project.getTimeSignature()))
        .filter((region): region is KGTempoRegion => region instanceof KGTempoRegion)
        .map(region => ({ start: region.getStartTick(), bpm: region.getBpm() }));
      return this.createSuccessResult({ ticks_per_quarter_note: TICKS_PER_QUARTER, bpms: bpms.length ? bpms : [{ start: 0, bpm: project.getBpm() }] });
    } catch (error) { return this.createErrorResult(`Failed to read BPM: ${error}`); }
  }
}

export class AdvancedReadKeySignatureTool extends AdvancedGlobalReader {
  readonly name = 'read_key_signature';
  readonly description = 'Read JSON {ticks_per_quarter_note:960,key_signatures:[{start,key_signature}]} with absolute integer ticks and keys such as C or Am. Key writers require canonical values such as C major or A minor.';
  async execute(_params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    void _params;
    try {
      const project = this.getCurrentProject();
      const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
      if (!track) return this.createErrorResult('Signature global track not found');
      const key_signatures = getSortedKeySignatureRegions(track, ticksPerBar(project.getTimeSignature()))
        .filter((region): region is KGKeySignatureRegion => region instanceof KGKeySignatureRegion)
        .map(region => ({ start: region.getStartTick(), key_signature: KEY_SIGNATURE_MAP[region.getKeySignature()].abcNotationKeySignature }));
      return this.createSuccessResult({ ticks_per_quarter_note: TICKS_PER_QUARTER, key_signatures: key_signatures.length ? key_signatures : [{ start: 0, key_signature: KEY_SIGNATURE_MAP[project.getKeySignature()].abcNotationKeySignature }] });
    } catch (error) { return this.createErrorResult(`Failed to read key signature: ${error}`); }
  }
}

export class AdvancedReadMarkersTool extends AdvancedGlobalReader {
  readonly name = 'read_markers';
  readonly description = 'Read JSON {ticks_per_quarter_note:960,markers:[{start,length,name}]} with absolute integer ticks. Markers are annotations only.';
  async execute(_params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    void _params;
    try {
      const track = findGlobalTrackByType(this.getCurrentProject(), GlobalTrackType.Marker);
      if (!track) return this.createErrorResult('Marker global track not found');
      const markers = track.getRegions().filter((region): region is KGMarkerRegion => region instanceof KGMarkerRegion)
        .map(region => ({ start: region.getStartTick(), length: region.getLengthTicks(), name: region.getName() }))
        .sort((a, b) => a.start - b.start);
      return this.createSuccessResult({ ticks_per_quarter_note: TICKS_PER_QUARTER, markers });
    } catch (error) { return this.createErrorResult(`Failed to read markers: ${error}`); }
  }
}

export class AdvancedGetUserSelectedMusicRangeAndTrackTool extends AdvancedReaderTool {
  readonly name = 'get_user_selected_music_range_and_track';
  readonly description = 'Read JSON {ticks_per_quarter_note:960,range:{start,end}|null,track:{track_id,track_name}|null}. Range uses absolute integer ticks. Preserves the current loop/selection targeting rules.';
  readonly parameters = {};
  async execute(_params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    void _params;
    try {
      const range = resolveSelectedMusicRangeContext();
      const track = resolveSelectedTrackContext();
      return this.createSuccessResult({ ticks_per_quarter_note: TICKS_PER_QUARTER,
        range: range.hasRange ? { start: range.startTick, end: range.endTick } : null,
        track: track.hasSelectedTrack ? { track_id: track.trackId, track_name: track.trackName } : null,
      });
    } catch (error) { return this.createErrorResult(`Failed to read selection: ${error}`); }
  }
}
