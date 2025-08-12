import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack, TrackType } from '../../track/KGTrack';
import { KGMidiTrack, type InstrumentType } from '../../track/KGMidiTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';

/**
 * Interface defining properties that can be updated on a track
 */
export interface TrackUpdateProperties {
  name?: string;
  instrument?: InstrumentType; // Only applies to MIDI tracks
  type?: TrackType;
  volume?: number;
}

/**
 * Command to update track properties
 * Handles updating track name, instrument, and type with undo support
 */
export class UpdateTrackCommand extends KGCommand {
  private trackId: number;
  private newProperties: TrackUpdateProperties;
  private originalProperties: TrackUpdateProperties = {};
  private targetTrack: KGTrack | null = null;
  private changedProperties: Set<keyof TrackUpdateProperties> = new Set();

  constructor(trackId: number, properties: TrackUpdateProperties) {
    super();
    this.trackId = trackId;
    this.newProperties = properties;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the target track
    this.targetTrack = tracks.find(track => track.getId() === this.trackId) || null;
    if (!this.targetTrack) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }

    // Store original properties for undo
    this.originalProperties = {
      name: this.targetTrack.getName(),
      type: this.targetTrack.getType(),
      volume: this.targetTrack.getVolume(),
    };

    // Store original instrument if it's a MIDI track
    if (this.targetTrack instanceof KGMidiTrack) {
      this.originalProperties.instrument = this.targetTrack.getInstrument();
    }

    // Apply updates and track what actually changes
    const updatedProperties: string[] = [];

    // Update name
    if (this.newProperties.name !== undefined && this.newProperties.name !== this.originalProperties.name) {
      this.targetTrack.setName(this.newProperties.name);
      this.changedProperties.add('name');
      updatedProperties.push(`name: "${this.originalProperties.name}" → "${this.newProperties.name}"`);
    }

    // Update type
    if (this.newProperties.type !== undefined && this.newProperties.type !== this.originalProperties.type) {
      this.targetTrack.setType(this.newProperties.type);
      this.changedProperties.add('type');
      updatedProperties.push(`type: ${this.originalProperties.type} → ${this.newProperties.type}`);
    }

    // Update instrument (only for MIDI tracks)
    if (this.newProperties.instrument !== undefined && this.targetTrack instanceof KGMidiTrack) {
      const originalInstrument = this.originalProperties.instrument;
      if (this.newProperties.instrument !== originalInstrument) {
        // Update the track model
        this.targetTrack.setInstrument(this.newProperties.instrument);
        
        // Update the audio interface
        const audioInterface = KGAudioInterface.instance();
        audioInterface.setTrackInstrument(this.trackId.toString(), this.newProperties.instrument);
        
        this.changedProperties.add('instrument');
        updatedProperties.push(`instrument: ${originalInstrument} → ${this.newProperties.instrument}`);
      }
    }

    // Update volume
    if (this.newProperties.volume !== undefined && this.newProperties.volume !== this.originalProperties.volume) {
      const newVolume = this.newProperties.volume;
      const originalVolume = this.originalProperties.volume;

      // Update the track model
      this.targetTrack.setVolume(newVolume);

      // Update the audio interface
      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackVolume(this.trackId.toString(), newVolume);

      this.changedProperties.add('volume');
      updatedProperties.push(`volume: ${originalVolume} → ${newVolume}`);
    }

    if (updatedProperties.length > 0) {
      console.log(`Updated track ${this.trackId}: ${updatedProperties.join(', ')}`);
    } else {
      console.log(`No changes applied to track ${this.trackId}`);
    }
  }

  undo(): void {
    if (!this.targetTrack) {
      throw new Error('Cannot undo: no track was updated');
    }

    // Only restore properties that were actually changed
    const restoredProperties: string[] = [];

    // Restore name (only if it was changed)
    if (this.changedProperties.has('name') && this.originalProperties.name !== undefined) {
      this.targetTrack.setName(this.originalProperties.name);
      restoredProperties.push(`name: "${this.originalProperties.name}"`);
    }

    // Restore type (only if it was changed)
    if (this.changedProperties.has('type') && this.originalProperties.type !== undefined) {
      this.targetTrack.setType(this.originalProperties.type);
      restoredProperties.push(`type: ${this.originalProperties.type}`);
    }

    // Restore instrument (only if it was changed and track is MIDI)
    if (this.changedProperties.has('instrument') && 
        this.originalProperties.instrument !== undefined && 
        this.targetTrack instanceof KGMidiTrack) {
      // Update the track model
      this.targetTrack.setInstrument(this.originalProperties.instrument);
      
      // Update the audio interface
      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackInstrument(this.trackId.toString(), this.originalProperties.instrument);
      
      restoredProperties.push(`instrument: ${this.originalProperties.instrument}`);
    }

    // Restore volume (only if it was changed)
    if (this.changedProperties.has('volume') && this.originalProperties.volume !== undefined) {
      // Update the track model
      this.targetTrack.setVolume(this.originalProperties.volume);

      // Update the audio interface
      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackVolume(this.trackId.toString(), this.originalProperties.volume);

      restoredProperties.push(`volume: ${this.originalProperties.volume}`);
    }

    console.log(`Restored track ${this.trackId}: ${restoredProperties.join(', ')}`);
  }

  getDescription(): string {
    const trackName = this.originalProperties.name || `Track ${this.trackId}`;
    const updatedProps: string[] = [];

    if (this.newProperties.name !== undefined) {
      updatedProps.push('name');
    }
    if (this.newProperties.instrument !== undefined) {
      updatedProps.push('instrument');
    }
    if (this.newProperties.type !== undefined) {
      updatedProps.push('type');
    }
    if (this.newProperties.volume !== undefined) {
      updatedProps.push('volume');
    }

    if (updatedProps.length === 1) {
      return `Update track "${trackName}" ${updatedProps[0]}`;
    } else if (updatedProps.length > 1) {
      return `Update track "${trackName}" properties`;
    }

    return `Update track "${trackName}"`;
  }

  /**
   * Get the ID of the track being updated
   */
  public getTrackId(): number {
    return this.trackId;
  }

  /**
   * Get the new properties being applied
   */
  public getNewProperties(): TrackUpdateProperties {
    return this.newProperties;
  }

  /**
   * Get the original properties (only available after execute)
   */
  public getOriginalProperties(): TrackUpdateProperties {
    return this.originalProperties;
  }

  /**
   * Get the target track instance (only available after execute)
   */
  public getTargetTrack(): KGTrack | null {
    return this.targetTrack;
  }

  /**
   * Get the properties that were actually changed (only available after execute)
   */
  public getChangedProperties(): Set<keyof TrackUpdateProperties> {
    return new Set(this.changedProperties);
  }
}