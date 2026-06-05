import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';
import {
  resolveSelectedMusicRangeContext,
  resolveSelectedTrackContext,
} from './toolTargeting';

export class GetUserSelectedMusicRangeAndTrackTool extends BaseTool {
  readonly name = 'get_user_selected_music_range_and_track';
  readonly description =
    'Get the current selected music range and the current selected regular track, if one is selected. Use this when selection context matters. When you are editing notes on the currently selected track, you do not need to pass track_id or track_name to note-editing tools.';

  readonly parameters: Record<string, ToolParameter> = {};

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const selectedMusicRange = resolveSelectedMusicRangeContext();
      const selectedTrack = resolveSelectedTrackContext();

      const selectedTrackSection = selectedTrack.hasSelectedTrack
        ? `track_id: ${selectedTrack.trackId}\ntrack_name: ${selectedTrack.trackName}`
        : 'No selected track.';

      return this.createSuccessResult(
        `Current Selected Music Range:\n${selectedMusicRange.section}\n\nCurrent Selected Track:\n${selectedTrackSection}`,
      );
    } catch (error) {
      return this.createErrorResult(`Failed to read current selected music range and track: ${error}`);
    }
  }
}
