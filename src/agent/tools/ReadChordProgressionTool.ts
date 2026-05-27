import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { useProjectStore } from '../../stores/projectStore';
import { KGCore } from '../../core/KGCore';
import { convertBeatRangeChordProgressionToABCNotation } from '../../util/abcNotationUtil';

/**
 * Tool for reading user-defined chord progression content from the global chord track.
 */
export class ReadChordProgressionTool extends BaseTool {
  readonly name = 'read_chord_progression';
  readonly description = 'Read the user-defined chord progression for the currently active or selected MIDI region. The output has two representations of the same progression: first symbolic chord names such as Em7b5, then note-based ABC chord tokens. Chord progression data comes only from chord regions the user defined on the global chord track, so it may be empty. If no chord progression is defined for this range, read the notes directly with read_music.';

  readonly parameters: Record<string, ToolParameter> = {};

  async execute(_params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const targetRegion = this.findTargetRegion();
      if (!targetRegion) {
        return this.createErrorResult(
          'No active or selected MIDI region found. Please open the piano roll with a region or select a MIDI region first.'
        );
      }

      const project = this.getCurrentProject();
      const startBeat = targetRegion.getStartFromBeat();
      const endBeat = startBeat + targetRegion.getLength();
      const result = convertBeatRangeChordProgressionToABCNotation(project, startBeat, endBeat);

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to read chord progression: ${error}`);
    }
  }

  private findTargetRegion(): KGMidiRegion | null {
    const project = this.getCurrentProject();
    const tracks = project.getTracks();
    const storeState = useProjectStore.getState();

    if (storeState.activeRegionId) {
      for (const track of tracks) {
        const region = track.getRegions().find(candidate => candidate.getId() === storeState.activeRegionId);
        if (region instanceof KGMidiRegion) {
          return region;
        }
      }
    }

    const selectedItems = KGCore.instance().getSelectedItems();
    for (const item of selectedItems) {
      if (item instanceof KGMidiRegion) {
        return item;
      }
    }

    return null;
  }
}
