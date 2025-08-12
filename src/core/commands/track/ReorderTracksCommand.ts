import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack } from '../../track/KGTrack';

/**
 * Command to reorder tracks in the project
 * Handles moving a track from one position to another with undo support
 */
export class ReorderTracksCommand extends KGCommand {
  private sourceIndex: number;
  private destinationIndex: number;
  private originalTrackOrder: KGTrack[] = [];

  constructor(sourceIndex: number, destinationIndex: number) {
    super();
    this.sourceIndex = sourceIndex;
    this.destinationIndex = destinationIndex;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Store original track order for undo
    this.originalTrackOrder = [...tracks];

    // Validate indices
    if (this.sourceIndex < 0 || this.sourceIndex >= tracks.length) {
      throw new Error(`Invalid source index: ${this.sourceIndex}`);
    }
    if (this.destinationIndex < 0 || this.destinationIndex >= tracks.length) {
      throw new Error(`Invalid destination index: ${this.destinationIndex}`);
    }

    // If source and destination are the same, do nothing
    if (this.sourceIndex === this.destinationIndex) {
      console.log('Source and destination indices are the same, no reordering needed');
      return;
    }

    // Create a copy of the tracks array
    const updatedTracks = [...tracks];
    
    // Remove the track from the source index
    const [movedTrack] = updatedTracks.splice(this.sourceIndex, 1);
    
    // Insert the track at the destination index
    updatedTracks.splice(this.destinationIndex, 0, movedTrack);
    
    // Update trackIndex for all tracks to match their array indices
    updatedTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    
    // Update the core model
    currentProject.setTracks(updatedTracks);

    const movedTrackName = movedTrack.getName();
    console.log(`Reordered track "${movedTrackName}" from index ${this.sourceIndex} to ${this.destinationIndex}`);
  }

  undo(): void {
    if (this.originalTrackOrder.length === 0) {
      throw new Error('Cannot undo: no original track order stored');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();

    // Restore the original track order
    const restoredTracks = [...this.originalTrackOrder];
    
    // Update trackIndex for all tracks to match their array indices
    restoredTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    
    // Update the core model
    currentProject.setTracks(restoredTracks);

    console.log(`Restored original track order (undoing reorder from ${this.sourceIndex} to ${this.destinationIndex})`);
  }

  getDescription(): string {
    if (this.originalTrackOrder.length > 0) {
      const movedTrack = this.originalTrackOrder[this.sourceIndex];
      const trackName = movedTrack ? movedTrack.getName() : `Track ${this.sourceIndex}`;
      return `Reorder track "${trackName}" from position ${this.sourceIndex + 1} to ${this.destinationIndex + 1}`;
    }
    return `Reorder track from position ${this.sourceIndex + 1} to ${this.destinationIndex + 1}`;
  }

  /**
   * Get the source index of the reorder operation
   */
  public getSourceIndex(): number {
    return this.sourceIndex;
  }

  /**
   * Get the destination index of the reorder operation
   */
  public getDestinationIndex(): number {
    return this.destinationIndex;
  }

  /**
   * Get the original track order (only available after execute)
   */
  public getOriginalTrackOrder(): KGTrack[] {
    return this.originalTrackOrder;
  }
}