import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGTrack } from '../../track/KGTrack';
import { generateUniqueId } from '../../../util/miscUtil';
import { useProjectStore } from '../../../stores/projectStore';

/**
 * Command to paste regions with their notes to a target track at a specific position
 * Handles creating new regions with new IDs and copying all notes with proper positioning
 */
export class PasteRegionsCommand extends KGCommand {
  private targetTrackId: string;
  private pastePosition: number;
  private sourceRegions: KGRegion[];
  private createdRegions: KGRegion[] = [];
  private targetTrack: KGTrack | null = null;

  constructor(targetTrackId: string, pastePosition: number, sourceRegions: KGRegion[]) {
    super();
    this.targetTrackId = targetTrackId;
    this.pastePosition = pastePosition;
    this.sourceRegions = [...sourceRegions]; // Create a copy to avoid reference issues
  }

  execute(): void {
    if (this.sourceRegions.length === 0) {
      throw new Error('No regions to paste');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the target track
    const targetTrack = tracks.find(track => track.getId().toString() === this.targetTrackId);
    if (!targetTrack) {
      throw new Error(`Target track with ID ${this.targetTrackId} not found`);
    }

    this.targetTrack = targetTrack;

    // Clear any previously created regions (for re-execution)
    this.createdRegions = [];

    // Calculate the base position from the first region to maintain relative positions
    const basePosition = this.sourceRegions[0].getStartFromBeat();

    // Create new regions at the target position
    this.sourceRegions.forEach((originalRegion) => {
      // Generate new ID for the pasted region
      const newId = generateUniqueId('KGMidiRegion');
      
      // Calculate new position maintaining relative offset
      const relativeOffset = originalRegion.getStartFromBeat() - basePosition;
      const newPosition = this.pastePosition + relativeOffset;
      
      // Create a copy of the region with new position and ID
      let newRegion: KGRegion;
      
      if (originalRegion instanceof KGMidiRegion) {
        newRegion = new KGMidiRegion(
          newId,
          targetTrack.getId().toString(),
          targetTrack.getTrackIndex(),
          `${originalRegion.getName()} (Copy)`,
          newPosition,
          originalRegion.getLength()
        );
        
        // Copy all notes from the original region
        const originalNotes = originalRegion.getNotes();
        originalNotes.forEach(note => {
          const copiedNote = new KGMidiNote(
            generateUniqueId('KGMidiNote'),
            note.getStartBeat(),
            note.getEndBeat(),
            note.getPitch(),
            note.getVelocity()
          );
          (newRegion as KGMidiRegion).addNote(copiedNote);
        });
        
        console.log(`Created MIDI region "${newRegion.getName()}" with ${originalNotes.length} notes`);
      } else {
        // Fallback for other region types
        newRegion = new KGRegion(
          newId,
          targetTrack.getId().toString(),
          targetTrack.getTrackIndex(),
          `${originalRegion.getName()} (Copy)`,
          newPosition,
          originalRegion.getLength()
        );
        
        console.log(`Created region "${newRegion.getName()}"`);
      }
      
      // Add the new region to the target track
      const currentRegions = targetTrack.getRegions();
      targetTrack.setRegions([...currentRegions, newRegion]);
      
      // Track the created region for undo
      this.createdRegions.push(newRegion);
    });
    
    console.log(`Pasted ${this.sourceRegions.length} regions to track ${this.targetTrackId} at position ${this.pastePosition}`);
  }

  undo(): void {
    if (!this.targetTrack || this.createdRegions.length === 0) {
      throw new Error('Cannot undo: no regions were pasted');
    }

    // Check if piano roll is open for any of the regions we're about to remove
    const regionIdsToRemove = new Set(this.createdRegions.map(r => r.getId()));
    
    // Get current active region from the store
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    
    // Close piano roll if it's open for one of the regions we're removing
    if (showPianoRoll && activeRegionId && regionIdsToRemove.has(activeRegionId)) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${activeRegionId} is being removed`);
    }

    // Remove all created regions from the target track
    const currentRegions = this.targetTrack.getRegions();
    const filteredRegions = currentRegions.filter(region => !regionIdsToRemove.has(region.getId()));
    this.targetTrack.setRegions(filteredRegions);
    
    console.log(`Removed ${this.createdRegions.length} pasted regions from track ${this.targetTrackId}`);
  }

  getDescription(): string {
    const regionCount = this.sourceRegions.length;
    const trackName = this.targetTrack ? this.targetTrack.getName() : `Track ${this.targetTrackId}`;
    
    if (regionCount === 1) {
      const regionName = this.sourceRegions[0].getName();
      return `Paste region "${regionName}" to "${trackName}"`;
    } else {
      return `Paste ${regionCount} regions to "${trackName}"`;
    }
  }

  /**
   * Get the target track ID
   */
  public getTargetTrackId(): string {
    return this.targetTrackId;
  }

  /**
   * Get the paste position
   */
  public getPastePosition(): number {
    return this.pastePosition;
  }

  /**
   * Get the source regions being pasted
   */
  public getSourceRegions(): KGRegion[] {
    return [...this.sourceRegions];
  }

  /**
   * Get the created regions (only available after execute)
   */
  public getCreatedRegions(): KGRegion[] {
    return [...this.createdRegions];
  }

  /**
   * Get the target track instance (only available after execute)
   */
  public getTargetTrack(): KGTrack | null {
    return this.targetTrack;
  }

  /**
   * Factory method to create a paste command from the clipboard
   */
  public static fromClipboard(targetTrackId: string, pastePosition: number): PasteRegionsCommand | null {
    const core = KGCore.instance();
    const copiedItems = core.getCopiedItems();
    const regionsToCreate = copiedItems.filter(item => item instanceof KGRegion) as KGRegion[];
    
    if (regionsToCreate.length === 0) {
      return null;
    }
    
    return new PasteRegionsCommand(targetTrackId, pastePosition, regionsToCreate);
  }

  /**
   * Factory method to create a paste command from specific regions
   */
  public static fromRegions(targetTrackId: string, pastePosition: number, regions: KGRegion[]): PasteRegionsCommand {
    return new PasteRegionsCommand(targetTrackId, pastePosition, regions);
  }
}