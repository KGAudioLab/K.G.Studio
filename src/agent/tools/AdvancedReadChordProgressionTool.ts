import { ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA, ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE, describeReaderResponse } from './advancedReaderResponses';
import type { StructuredToolPayload, ToolResult } from './BaseTool';
import { AdvancedReaderTool, advancedMusicMetadata } from './advancedToolUtils';
import { resolveActiveOrSelectedMidiRegionContext } from './toolTargeting';
import { findGlobalTrackByType } from '../../util/globalTrackUtil';
import { GlobalTrackType } from '../../core/global-track';
import { KGChordRegion } from '../../core/region/KGChordRegion';

export class AdvancedReadChordProgressionTool extends AdvancedReaderTool {
  readonly name = 'read_chord_progression';
  readonly description = describeReaderResponse(
    'Read global chord references as JSON with chords:[{chord,start,length}], in absolute integer ticks (960 per quarter note). Reads the active/selected MIDI region range, otherwise the full song through the last chord. Includes full overlapping chords; annotations do not produce sound.',
    ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_SCHEMA,
    ADVANCED_READ_CHORD_PROGRESSION_RESPONSE_EXAMPLE,
  );
  readonly parameters = {};

  async execute(_params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    void _params;
    try {
      const project = this.getCurrentProject();
      const track = findGlobalTrackByType(project, GlobalTrackType.Chord);
      if (!track) return this.createSuccessResult({ msg: 'No chord progression has been defined for this project.' });
      const regions = track.getRegions().filter((region): region is KGChordRegion => region instanceof KGChordRegion);
      const selected = resolveActiveOrSelectedMidiRegionContext();
      const start = selected?.region.getStartTick() ?? 0;
      const end = selected ? start + selected.region.getLengthTicks() : Math.max(0, ...regions.map(region => region.getStartTick() + region.getLengthTicks()));
      const chords = regions.filter(region => region.getStartTick() < end && region.getStartTick() + region.getLengthTicks() > start)
        .map(region => ({ chord: region.getSymbol(), start: region.getStartTick(), length: region.getLengthTicks() }))
        .sort((a, b) => a.start - b.start || a.chord.localeCompare(b.chord));
      return this.createSuccessResult({ track_id: track.getId(), track_name: track.getName(), ...advancedMusicMetadata(project, start), chords });
    } catch (error) {
      return this.createErrorResult(`Failed to read chord progression: ${error}`);
    }
  }
}
