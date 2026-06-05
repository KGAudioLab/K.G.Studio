import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';

export class ListAllTracksTool extends BaseTool {
  readonly name = 'list_all_tracks';
  readonly description =
    'List all MIDI tracks in the project with their track_id, track_name, and instrument name in English. Use this when you need to inspect available target tracks before choosing one.';

  readonly parameters: Record<string, ToolParameter> = {};

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const midiTracks = this.getCurrentProject().getTracks().filter(
        (track): track is KGMidiTrack => track instanceof KGMidiTrack,
      );

      if (midiTracks.length === 0) {
        return this.createSuccessResult('No MIDI tracks found.');
      }

      const result = midiTracks.map(track => {
        const instrumentKey = track.getInstrument();
        const instrumentName = FLUIDR3_INSTRUMENT_MAP[instrumentKey]?.displayName ?? instrumentKey;
        const trackName = track.getName() || `Track ${track.getTrackIndex() + 1}`;

        return [
          `track_id: ${track.getId().toString()}`,
          `track_name: ${trackName}`,
          `instrument: ${instrumentName}`,
        ].join('\n');
      }).join('\n\n');

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to list tracks: ${error}`);
    }
  }
}
