import { ADVANCED_READ_MUSIC_RESPONSE_SCHEMA, ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE, describeReaderResponse } from './advancedReaderResponses';
import type { StructuredToolPayload, ToolParameter, ToolResult } from './BaseTool';
import { AdvancedReaderTool, advancedMusicMetadata, requireTick } from './advancedToolUtils';
import { ReadMusicTool } from './ReadMusicTool';
import { normalizeOptionalTrackIdParam } from './trackIdNormalization';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { getInstrumentDisplayName } from '../../core/instruments/instrumentResolver';
import { pitchToNoteNameString } from '../../util/midiUtil';

export class AdvancedReadMusicTool extends AdvancedReaderTool {
  readonly name = 'read_music';
  readonly description = describeReaderResponse(
    'Read MIDI music as structured JSON {tracks:[...]}, with exact stored pitches, velocities, absolute starts and lengths in integer ticks (960 per quarter note). Includes full events overlapping the exact requested range; no bar rounding or quantization.',
    ADVANCED_READ_MUSIC_RESPONSE_SCHEMA,
    ADVANCED_READ_MUSIC_RESPONSE_EXAMPLE,
  );
  readonly parameters: Record<string, ToolParameter> = {
    track_id: { type: 'string', description: 'Track ID, or "all". Omitted reads all MIDI tracks.' },
    start: { type: 'number', description: 'Nonnegative integer absolute timeline tick. Defaults to 0.' },
    length: { type: 'number', description: 'Positive integer duration in ticks. Omitted reads to each track end.' },
  };

  override isAvailableInRegularMode(): boolean {
    return new ReadMusicTool().isAvailableInRegularMode();
  }

  async execute(params: Record<string, unknown>): Promise<ToolResult<StructuredToolPayload>> {
    try {
      const args = normalizeOptionalTrackIdParam(params);
      this.validateParameters(args);
      const start = args.start === undefined ? 0 : requireTick(args.start, 'start');
      const end = args.length === undefined ? Infinity : start + requireTick(args.length, 'length', true);
      if (end !== Infinity && !Number.isSafeInteger(end)) throw new Error('Range end exceeds safe integer ticks.');
      const project = this.getCurrentProject();
      const id = args.track_id as string | undefined;
      const all = project.getTracks();
      const selected = id && id !== 'all' ? all.filter(track => String(track.getId()) === id) : all;
      if (id && id !== 'all' && selected.length === 0) return this.createErrorResult(`Track with ID "${id}" not found`);
      if (id && id !== 'all' && !(selected[0] instanceof KGMidiTrack)) return this.createErrorResult('Track is not a MIDI track');
      const tracks = selected.filter((track): track is KGMidiTrack => track instanceof KGMidiTrack).map(track => {
        const notes = track.getRegions().flatMap(region => {
          if (!(region instanceof KGMidiRegion) || region.getStartTick() >= end || region.getStartTick() + region.getLengthTicks() <= start) return [];
          return region.getNotes().map(note => ({
            pitch: pitchToNoteNameString(note.getPitch()),
            start: region.getStartTick() + note.getStartTick(),
            length: note.getEndTick() - note.getStartTick(),
            velocity: note.getVelocity(),
          })).filter(note => note.start < end && note.start + note.length > start);
        }).sort((a, b) => a.start - b.start || a.pitch.localeCompare(b.pitch) || a.length - b.length);
        return {
          track_id: track.getId(), track_name: track.getName() || 'Unnamed Track',
          instrument: getInstrumentDisplayName(String(track.getInstrument())),
          ...advancedMusicMetadata(project, start), notes,
        };
      });
      return this.createSuccessResult({ tracks });
    } catch (error) {
      return this.createErrorResult(`Failed to read music: ${error}`);
    }
  }
}
