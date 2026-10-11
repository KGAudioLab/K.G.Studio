import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import {
  ADVANCED_LIST_ALL_TRACKS_RESPONSE_SCHEMA,
  ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE,
  describeReaderResponse,
} from './advancedReaderResponses';

export type AdvancedListAllTracksPayload = {
  tracks: Array<{
    track_id: number;
    track_name: string;
    instrument: string;
    volume: number;
    pan: number;
    status: { mute: boolean; solo: boolean };
  }>;
};

export class AdvancedListAllTracks extends BaseTool<AdvancedListAllTracksPayload> {
  readonly name = 'list_all_tracks';
  readonly description = describeReaderResponse(
    'List all MIDI tracks in project order as structured JSON, with numeric track IDs, names, English instrument names, stored volume in dB, stored pan (-1 left, 0 center, 1 right), and explicit mute/solo flags. Does not evaluate automation. Use this to inspect target tracks before choosing one.',
    ADVANCED_LIST_ALL_TRACKS_RESPONSE_SCHEMA,
    ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE,
  );
  readonly parameters: Record<string, ToolParameter> = {};

  override isAvailableInRegularMode(): boolean { return false; }
  override isAvailableInEfficientMode(): boolean { return false; }
  override isAvailableInAdvancedMode(): boolean { return true; }

  async execute(_params: Record<string, unknown>): Promise<ToolResult<AdvancedListAllTracksPayload>> {
    try {
      const tracks = this.getCurrentProject().getTracks()
        .filter((track): track is KGMidiTrack => track instanceof KGMidiTrack)
        .map(track => {
          const instrumentKey = track.getInstrument();
          return {
            track_id: track.getId(),
            track_name: track.getName() || `Track ${track.getTrackIndex() + 1}`,
            instrument: FLUIDR3_INSTRUMENT_MAP[instrumentKey]?.displayName ?? instrumentKey,
            volume: track.getVolume(),
            pan: track.getPan(),
            status: { mute: track.getMuted(), solo: track.getSolo() },
          };
        });
      return this.createSuccessResult({ tracks });
    } catch (error) {
      return this.createErrorResult(`Failed to list tracks: ${error}`);
    }
  }
}
