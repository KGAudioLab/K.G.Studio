import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { DeleteNotesCommand } from '../../core/commands/note/DeleteNotesCommand';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { useProjectStore } from '../../stores/projectStore';
import { KGCore } from '../../core/KGCore';

/**
 * Tool for removing notes from MIDI regions within a specified beat range
 * Integrates with the existing command system for undo/redo support
 */
export class RemoveNotesTool extends BaseTool {
  readonly name = 'remove_notes';
  readonly description = 'Remove MIDI notes from the current region within a specified beat range. All notes that start within the range will be deleted.';
  
  readonly parameters: Record<string, ToolParameter> = {
    start_beat: {
      type: 'number',
      description: 'Start of the beat range to remove notes from (inclusive)',
      required: true
    },
    end_beat: {
      type: 'number',
      description: 'End of the beat range to remove notes from (exclusive)',
      required: true
    },
    region_id: {
      type: 'string',
      description: 'ID of the region to remove notes from. If not provided, uses the currently selected region.',
      required: false
    }
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Validate parameters
      this.validateParameters(params);
      
      const startBeat = params.start_beat as number;
      const endBeat = params.end_beat as number;
      const regionId = params.region_id as string | undefined;
      
      // Validate beat range
      if (startBeat < 0) {
        return this.createErrorResult(`Invalid start_beat ${startBeat}. Must be >= 0.`);
      }
      
      if (endBeat <= startBeat) {
        return this.createErrorResult(`Invalid beat range: end_beat (${endBeat}) must be greater than start_beat (${startBeat}).`);
      }
      
      // Find the target region
      const targetRegion = this.findTargetRegion(regionId);
      if (!targetRegion) {
        return this.createErrorResult(
          regionId 
            ? `Region with ID "${regionId}" not found or is not a MIDI region`
            : 'No active or selected MIDI region found. Please open the piano roll with a region or select a MIDI region first.'
        );
      }

      // Adjust beat range relative to region's start beat
      const regionStartBeat = targetRegion.getStartFromBeat();
      const adjustedStartBeat = startBeat - regionStartBeat;
      const adjustedEndBeat = endBeat - regionStartBeat;
      
      // Find all notes within the specified beat range
      const notesToRemove = this.findNotesInRange(targetRegion, adjustedStartBeat, adjustedEndBeat);
      
      if (notesToRemove.length === 0) {
        return this.createSuccessResult(
          `No notes found in the range from beat ${startBeat} to ${endBeat}.`
        );
      }

      // Extract note IDs for deletion
      const noteIds = notesToRemove.map(note => note.getId());
      
      // Execute the deletion command
      const command = new DeleteNotesCommand(noteIds);
      await this.executeCommand(command);
      
      // Create success message
      const noteCount = notesToRemove.length;
      const noteList = notesToRemove
        .map(note => {
          const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
          const octave = Math.floor(note.getPitch() / 12) - 1;
          const noteName = noteNames[note.getPitch() % 12];
          return `${noteName}${octave}`;
        })
        .join(', ');
      
      return this.createSuccessResult(
        `Successfully removed ${noteCount} note${noteCount > 1 ? 's' : ''} from beats ${startBeat}-${endBeat}: ${noteList}`
      );
      
    } catch (error) {
      return this.createErrorResult(`Failed to remove notes: ${error}`);
    }
  }

  /**
   * Find the target region for note removal
   * Priority: 1) Specified regionId, 2) Active piano roll region, 3) Selected regions, 4) Error if none found
   */
  private findTargetRegion(regionId?: string): KGMidiRegion | null {
    const project = this.getCurrentProject();
    const tracks = project.getTracks();
    
    if (regionId) {
      // Find specific region by ID
      for (const track of tracks) {
        const regions = track.getRegions();
        const region = regions.find(r => r.getId() === regionId);
        if (region && region instanceof KGMidiRegion) {
          return region;
        }
      }
      return null;
    } else {
      // Smart region finding: try different sources in priority order
      
      // 1. Try active piano roll region
      const storeState = useProjectStore.getState();
      if (storeState.activeRegionId) {
        for (const track of tracks) {
          const regions = track.getRegions();
          const region = regions.find(r => r.getId() === storeState.activeRegionId);
          if (region && region instanceof KGMidiRegion) {
            return region;
          }
        }
      }
      
      // 2. Try selected regions
      const core = this.getKGCore();
      const selectedItems = core.getSelectedItems();
      for (const item of selectedItems) {
        if (item instanceof KGMidiRegion) {
          return item;
        }
      }
      
      // 3. No fallback - return null to trigger error
      return null;
    }
  }

  /**
   * Get KGCore instance for selection access
   */
  private getKGCore() {
    return KGCore.instance();
  }

  /**
   * Find all notes within the specified beat range
   * Notes are included if their start beat is within [startBeat, endBeat)
   */
  private findNotesInRange(region: KGMidiRegion, startBeat: number, endBeat: number) {
    const notes = region.getNotes();
    return notes.filter(note => {
      const noteStartBeat = note.getStartBeat();
      return noteStartBeat >= startBeat && noteStartBeat < endBeat;
    });
  }
}