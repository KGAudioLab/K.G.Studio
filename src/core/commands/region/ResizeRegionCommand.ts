import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';

/**
 * Command to resize a region (change start position and/or length)
 * Handles both the core model update and note adjustments for start position changes
 */
export class ResizeRegionCommand extends KGCommand {
  private regionId: string;
  private newStartFromBeat: number;
  private newLength: number;
  private originalStartFromBeat: number = 0;
  private originalLength: number = 0;
  private targetRegion: KGRegion | null = null;
  
  // Store note adjustments for undo
  private noteAdjustments: Array<{
    noteId: string;
    originalStartBeat: number;
    originalEndBeat: number;
  }> = [];

  constructor(regionId: string, newStartFromBeat: number, newLength: number) {
    super();
    this.regionId = regionId;
    this.newStartFromBeat = newStartFromBeat;
    this.newLength = newLength;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region to resize
    let targetRegion: KGRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region) {
        targetRegion = region;
        break;
      }
    }

    if (!targetRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    this.targetRegion = targetRegion;

    // Store original values for undo
    this.originalStartFromBeat = targetRegion.getStartFromBeat();
    this.originalLength = targetRegion.getLength();

    // Handle note adjustments if start position changes (left-edge resize)
    if (this.newStartFromBeat !== this.originalStartFromBeat && targetRegion instanceof KGMidiRegion) {
      const beatOffset = this.newStartFromBeat - this.originalStartFromBeat;
      
      // Store original note positions and adjust notes to maintain absolute positions
      const notes = targetRegion.getNotes();
      notes.forEach(note => {
        // Store original positions for undo
        this.noteAdjustments.push({
          noteId: note.getId(),
          originalStartBeat: note.getStartBeat(),
          originalEndBeat: note.getEndBeat()
        });
        
        // Adjust note positions to maintain absolute position
        note.setStartBeat(note.getStartBeat() - beatOffset);
        note.setEndBeat(note.getEndBeat() - beatOffset);
      });
      
      console.log(`Adjusted ${notes.length} notes by offset ${-beatOffset} beats to maintain absolute positions`);
    }

    // Apply the resize
    targetRegion.setStartFromBeat(this.newStartFromBeat);
    targetRegion.setLength(this.newLength);

    const regionName = targetRegion.getName();
    console.log(`Resized region "${regionName}": start ${this.originalStartFromBeat} → ${this.newStartFromBeat}, length ${this.originalLength} → ${this.newLength}`);
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no region was resized');
    }

    // Restore note positions if they were adjusted
    if (this.noteAdjustments.length > 0 && this.targetRegion instanceof KGMidiRegion) {
      const notes = this.targetRegion.getNotes();
      
      // Restore each note to its original position
      this.noteAdjustments.forEach(adjustment => {
        const note = notes.find(n => n.getId() === adjustment.noteId);
        if (note) {
          note.setStartBeat(adjustment.originalStartBeat);
          note.setEndBeat(adjustment.originalEndBeat);
        }
      });
      
      console.log(`Restored ${this.noteAdjustments.length} notes to their original positions`);
    }

    // Restore original region values
    this.targetRegion.setStartFromBeat(this.originalStartFromBeat);
    this.targetRegion.setLength(this.originalLength);

    const regionName = this.targetRegion.getName();
    console.log(`Restored region "${regionName}": start ${this.newStartFromBeat} → ${this.originalStartFromBeat}, length ${this.newLength} → ${this.originalLength}`);
  }

  getDescription(): string {
    const regionName = this.targetRegion ? this.targetRegion.getName() : `Region ${this.regionId}`;
    return `Resize region "${regionName}"`;
  }

  /**
   * Get the ID of the region being resized
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the new start position
   */
  public getNewStartFromBeat(): number {
    return this.newStartFromBeat;
  }

  /**
   * Get the new length
   */
  public getNewLength(): number {
    return this.newLength;
  }

  /**
   * Get the original start position (only available after execute)
   */
  public getOriginalStartFromBeat(): number {
    return this.originalStartFromBeat;
  }

  /**
   * Get the original length (only available after execute)
   */
  public getOriginalLength(): number {
    return this.originalLength;
  }

  /**
   * Get the target region instance (only available after execute)
   */
  public getTargetRegion(): KGRegion | null {
    return this.targetRegion;
  }

  /**
   * Factory method to create a resize command for position only (move without length change)
   */
  public static createMoveCommand(regionId: string, newStartFromBeat: number, currentLength: number): ResizeRegionCommand {
    return new ResizeRegionCommand(regionId, newStartFromBeat, currentLength);
  }

  /**
   * Factory method to create a resize command for length only (resize without position change)
   */
  public static createLengthChangeCommand(regionId: string, currentStartFromBeat: number, newLength: number): ResizeRegionCommand {
    return new ResizeRegionCommand(regionId, currentStartFromBeat, newLength);
  }

  /**
   * Factory method to create a resize command from bar-based coordinates
   */
  public static fromBarCoordinates(
    regionId: string,
    newBarNumber: number,
    newLengthInBars: number,
    timeSignature: { numerator: number; denominator: number }
  ): ResizeRegionCommand {
    const beatsPerBar = timeSignature.numerator;
    const newStartFromBeat = (newBarNumber - 1) * beatsPerBar;
    const newLength = newLengthInBars * beatsPerBar;
    
    return new ResizeRegionCommand(regionId, newStartFromBeat, newLength);
  }
}