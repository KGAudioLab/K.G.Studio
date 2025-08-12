import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { CreateNotesCommand } from '../../core/commands/note/CreateNotesCommand';
import type { NoteCreationData } from '../../core/commands/note/CreateNotesCommand';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { useProjectStore } from '../../stores/projectStore';
import { KGCore } from '../../core/KGCore';

/**
 * Tool for adding notes to MIDI regions
 * Integrates with the existing command system for undo/redo support
 */
export class AddNotesTool extends BaseTool {
  readonly name = 'add_notes';
  readonly description = 'Create one or more MIDI notes in the current region. Each note requires pitch (e.g., "C4", "F#3"), start_beat (beat position), and length (duration in beats).';
  
  readonly parameters: Record<string, ToolParameter> = {
    notes: {
      type: 'array',
      description: 'Array of notes to create',
      required: true,
      items: {
        type: 'object',
        description: 'A MIDI note definition',
        properties: {
          pitch: {
            type: 'string',
            description: 'Note pitch in scientific notation (e.g., "C4", "F#3", "Bb2")',
            required: true
          },
          start_beat: {
            type: 'number',
            description: 'Start position in beats (e.g., 0, 1.5, 2)',
            required: true
          },
          length: {
            type: 'number',
            description: 'Note duration in beats (e.g., 1, 0.5, 4)',
            required: true
          },
          velocity: {
            type: 'number',
            description: 'Note velocity (1-127, default: 127)',
            required: false
          }
        }
      }
    },
    region_id: {
      type: 'string',
      description: 'ID of the region to add notes to. If not provided, uses the currently selected region.',
      required: false
    }
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Validate parameters
      this.validateParameters(params);
      
      const notes = params.notes as Array<{
        pitch: string;
        start_beat: number;
        length: number;
        velocity?: number;
      }>;
      
      const regionId = params.region_id as string | undefined;
      
      // Find the target region
      const targetRegion = this.findTargetRegion(regionId);
      if (!targetRegion) {
        return this.createErrorResult(
          regionId 
            ? `Region with ID "${regionId}" not found or is not a MIDI region`
            : 'No active or selected MIDI region found. Please open the piano roll with a region or select a MIDI region first.'
        );
      }

      // Validate and convert notes to creation data
      const noteCreationData: NoteCreationData[] = [];
      const createdNotes: Array<{ pitch: string; start_beat: number; length: number }> = [];
      
      for (const note of notes) {
        try {
          const midiPitch = this.convertPitchToMidi(note.pitch);
          const velocity = note.velocity ?? 127;
          
          // Validate velocity range
          if (velocity < 1 || velocity > 127) {
            return this.createErrorResult(`Invalid velocity ${velocity}. Must be between 1 and 127.`);
          }
          
          // Validate beat positions
          if (note.start_beat < 0) {
            return this.createErrorResult(`Invalid start_beat ${note.start_beat}. Must be >= 0.`);
          }
          
          if (note.length <= 0) {
            return this.createErrorResult(`Invalid length ${note.length}. Must be > 0.`);
          }
          
          // Adjust note position relative to region's start beat
          const regionStartBeat = targetRegion.getStartFromBeat();
          const adjustedStartBeat = note.start_beat - regionStartBeat;
          const adjustedEndBeat = adjustedStartBeat + note.length;
          
          // Create note creation data
          noteCreationData.push({
            regionId: targetRegion.getId(),
            startBeat: adjustedStartBeat,
            endBeat: adjustedEndBeat,
            pitch: midiPitch,
            velocity
          });
          
          createdNotes.push({
            pitch: note.pitch,
            start_beat: note.start_beat,
            length: note.length
          });
          
        } catch (error) {
          return this.createErrorResult(`Invalid note pitch "${note.pitch}": ${error}`);
        }
      }
      
      // Execute the bulk note creation command
      const command = new CreateNotesCommand(noteCreationData);
      await this.executeCommand(command);
      
      // Create success message
      const noteCount = createdNotes.length;
      const noteList = createdNotes
        .map(note => `${note.pitch} (beat ${note.start_beat}, length ${note.length})`)
        .join(', ');
      
      return this.createSuccessResult(
        `Successfully created ${noteCount} note${noteCount > 1 ? 's' : ''}: ${noteList}`
      );
      
    } catch (error) {
      return this.createErrorResult(`Failed to create notes: ${error}`);
    }
  }

  /**
   * Find the target region for note creation
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
   * Convert pitch string to MIDI note number
   * Supports formats like: C4, F#3, Bb2, C#5
   */
  private convertPitchToMidi(pitch: string): number {
    const match = pitch.match(/^([A-G])([#b]?)(\d+)$/);
    if (!match) {
      throw new Error(`Invalid pitch format "${pitch}". Use format like "C4", "F#3", "Bb2"`);
    }
    
    const [, noteName, accidental, octaveStr] = match;
    const octave = parseInt(octaveStr);
    
    // Base MIDI notes for C octave (C4 = 60)
    const noteOffsets: Record<string, number> = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    };
    
    let midiNote = (octave + 1) * 12 + noteOffsets[noteName];
    
    // Apply accidentals
    if (accidental === '#') {
      midiNote += 1;
    } else if (accidental === 'b') {
      midiNote -= 1;
    }
    
    // Validate MIDI range
    if (midiNote < 0 || midiNote > 127) {
      throw new Error(`Note "${pitch}" is out of MIDI range (0-127)`);
    }
    
    return midiNote;
  }
}