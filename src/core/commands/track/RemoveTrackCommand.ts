import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack } from '../../track/KGTrack';
import { KGMidiTrack, type InstrumentType } from '../../track/KGMidiTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

/**
 * Command to remove a track from the project
 * Handles both the core model update and audio interface cleanup
 */
export class RemoveTrackCommand extends KGCommand {
  private trackId: number;
  private removedTrack: KGTrack | null = null;
  private originalTrackIndex: number = 0;
  private originalInstrument: InstrumentType = 'acoustic_grand_piano';

  constructor(trackId: number) {
    super();
    this.trackId = trackId;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Find the track to remove
    const trackToRemove = tracks.find(track => track.getId() === this.trackId);
    if (!trackToRemove) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }
    
    // Store the track data for undo
    this.removedTrack = trackToRemove;
    this.originalTrackIndex = trackToRemove.getTrackIndex();
    
    // Store instrument if it's a MIDI track
    if (trackToRemove.getCurrentType() === 'KGMidiTrack' && 'getInstrument' in trackToRemove) {
      this.originalInstrument = (trackToRemove as KGMidiTrack).getInstrument();
    }
    
    // Remove audio synth for the track
    const audioInterface = KGAudioInterface.instance();
    audioInterface.removeTrackSynth(this.trackId.toString());
    
    // Remove the track from the core model
    const updatedTracks = tracks.filter(track => track.getId() !== this.trackId);
    
    // Update track indices to match new array positions
    updatedTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    
    currentProject.setTracks(updatedTracks);
    
    console.log(`Removed track ${this.trackId} and its audio synth`);
  }

  undo(): void {
    if (!this.removedTrack) {
      throw new Error('Cannot undo: no track was removed');
    }
    
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Restore the track to its original position
    const updatedTracks = [...tracks];
    
    // Insert the track at the correct position
    if (this.originalTrackIndex >= updatedTracks.length) {
      // Add to the end
      updatedTracks.push(this.removedTrack);
    } else {
      // Insert at the original position
      updatedTracks.splice(this.originalTrackIndex, 0, this.removedTrack);
    }
    
    // Update track indices to match array positions
    updatedTracks.forEach((track, index) => {
      track.setTrackIndex(index);
    });
    
    // Update the core model
    currentProject.setTracks(updatedTracks);
    
    // Recreate audio synth for the track
    const audioInterface = KGAudioInterface.instance();
    audioInterface.createTrackSynth(this.trackId.toString(), this.originalInstrument);
    
    console.log(`Restored track ${this.trackId} with ${this.originalInstrument} instrument`);
  }

  getDescription(): string {
    const trackName = this.removedTrack ? this.removedTrack.getName() : `Track ${this.trackId}`;
    return `Remove track "${trackName}"`;
  }

  /**
   * Get the ID of the track that was/will be removed
   */
  public getTrackId(): number {
    return this.trackId;
  }

  /**
   * Get the removed track instance (only available after execute)
   */
  public getRemovedTrack(): KGTrack | null {
    return this.removedTrack;
  }
}