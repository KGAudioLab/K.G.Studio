import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiTrack, type InstrumentType } from '../../track/KGMidiTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { generateNewTrackName } from '../../../util/miscUtil';

/**
 * Command to add a new track to the project
 * Handles both the core model update and audio interface setup
 */
export class AddTrackCommand extends KGCommand {
  private trackId: number;
  private trackName: string;
  private instrument: InstrumentType;
  private trackIndex: number;
  private createdTrack: KGMidiTrack | null = null;

  constructor(trackId?: number, trackName?: string, instrument: InstrumentType = 'acoustic_grand_piano') {
    super();
    
    // If trackId not provided, calculate it
    if (trackId === undefined) {
      const currentProject = KGCore.instance().getCurrentProject();
      const tracks = currentProject.getTracks();
      this.trackId = tracks.length > 0 
        ? Math.max(...tracks.map(track => track.getId())) + 1 
        : 1;
    } else {
      this.trackId = trackId;
    }
    
    this.trackName = trackName || generateNewTrackName();
    this.instrument = instrument;
    
    // Track index will be set during execution
    this.trackIndex = 0;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Set the track index to be the last index in the array
    this.trackIndex = tracks.length;
    
    // Create a new MIDI track
    this.createdTrack = new KGMidiTrack(this.trackName, this.trackId);
    this.createdTrack.setTrackIndex(this.trackIndex);
    this.createdTrack.setInstrument(this.instrument);
    
    // Update the core model
    const updatedTracks = [...tracks, this.createdTrack];
    currentProject.setTracks(updatedTracks);
    
    // Create audio synth for the new track (initialize with track volume)
    const audioInterface = KGAudioInterface.instance();
    audioInterface.createTrackSynth(this.trackId.toString(), this.instrument);
    
    console.log(`Added track ${this.trackId} with ${this.instrument} instrument`);
  }

  undo(): void {
    if (!this.createdTrack) {
      throw new Error('Cannot undo: no track was created');
    }
    
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Remove the track from the core model
    const updatedTracks = tracks.filter(track => track.getId() !== this.trackId);
    currentProject.setTracks(updatedTracks);
    
    // Remove audio synth for the track
    const audioInterface = KGAudioInterface.instance();
    audioInterface.removeTrackSynth(this.trackId.toString());
    
    console.log(`Removed track ${this.trackId} and its audio synth`);
  }

  getDescription(): string {
    return `Add track "${this.trackName}"`;
  }

  /**
   * Get the ID of the track that was/will be created
   */
  public getTrackId(): number {
    return this.trackId;
  }

  /**
   * Get the created track instance (only available after execute)
   */
  public getCreatedTrack(): KGMidiTrack | null {
    return this.createdTrack;
  }
}