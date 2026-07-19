import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack, TrackType } from '../../track/KGTrack';
import { KGMidiTrack, type InstrumentType } from '../../track/KGMidiTrack';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { isPercussionInstrument } from '../../instruments/instrumentResolver';

/**
 * Interface defining properties that can be updated on a track
 */
export interface TrackUpdateProperties {
  name?: string;
  instrument?: InstrumentType; // Only applies to MIDI tracks
  type?: TrackType;
  volume?: number;
  muted?: boolean;
  solo?: boolean;
  color?: string | null;
  noTranspose?: boolean;
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
      muted: this.targetTrack.getMuted(),
      solo: this.targetTrack.getSolo(),
      color: this.targetTrack.getColor(),
    };

    // Store original instrument if it's a MIDI track
    if (this.targetTrack instanceof KGMidiTrack) {
      this.originalProperties.instrument = this.targetTrack.getInstrument();
      this.originalProperties.noTranspose = this.targetTrack.getNoTranspose();
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

      const nextNoTranspose = this.newProperties.noTranspose
        ?? (isPercussionInstrument(String(this.newProperties.instrument)) ? true : this.originalProperties.noTranspose);
      if (nextNoTranspose !== undefined && nextNoTranspose !== this.originalProperties.noTranspose) {
        this.targetTrack.setNoTranspose(nextNoTranspose);
        this.changedProperties.add('noTranspose');
        updatedProperties.push(`no transpose: ${this.originalProperties.noTranspose} → ${nextNoTranspose}`);
      }
    } else if (
      this.newProperties.noTranspose !== undefined
      && this.targetTrack instanceof KGMidiTrack
      && this.newProperties.noTranspose !== this.originalProperties.noTranspose
    ) {
      this.targetTrack.setNoTranspose(this.newProperties.noTranspose);
      this.changedProperties.add('noTranspose');
      updatedProperties.push(`no transpose: ${this.originalProperties.noTranspose} → ${this.newProperties.noTranspose}`);
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

    if (this.newProperties.muted !== undefined && this.newProperties.muted !== this.originalProperties.muted) {
      const newMuted = this.newProperties.muted;
      const originalMuted = this.originalProperties.muted;

      this.targetTrack.setMuted(newMuted);

      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackMute(this.trackId.toString(), newMuted);

      this.changedProperties.add('muted');
      updatedProperties.push(`muted: ${originalMuted} → ${newMuted}`);
    }

    if (this.newProperties.solo !== undefined && this.newProperties.solo !== this.originalProperties.solo) {
      const newSolo = this.newProperties.solo;
      const originalSolo = this.originalProperties.solo;

      this.targetTrack.setSolo(newSolo);

      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackSolo(this.trackId.toString(), newSolo);

      this.changedProperties.add('solo');
      updatedProperties.push(`solo: ${originalSolo} → ${newSolo}`);
    }

    if ('color' in this.newProperties && this.newProperties.color !== this.originalProperties.color) {
      const newColor = this.newProperties.color ?? undefined;
      const originalColor = this.originalProperties.color;

      this.targetTrack.setColor(newColor);

      this.changedProperties.add('color');
      updatedProperties.push(`color: ${originalColor ?? 'none'} → ${newColor}`);
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

    if (this.changedProperties.has('noTranspose') && this.targetTrack instanceof KGMidiTrack) {
      this.targetTrack.setNoTranspose(this.originalProperties.noTranspose ?? false);
      restoredProperties.push(`no transpose: ${this.originalProperties.noTranspose ?? false}`);
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

    if (this.changedProperties.has('muted') && this.originalProperties.muted !== undefined) {
      this.targetTrack.setMuted(this.originalProperties.muted);

      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackMute(this.trackId.toString(), this.originalProperties.muted);

      restoredProperties.push(`muted: ${this.originalProperties.muted}`);
    }

    if (this.changedProperties.has('solo') && this.originalProperties.solo !== undefined) {
      this.targetTrack.setSolo(this.originalProperties.solo);

      const audioInterface = KGAudioInterface.instance();
      audioInterface.setTrackSolo(this.trackId.toString(), this.originalProperties.solo);

      restoredProperties.push(`solo: ${this.originalProperties.solo}`);
    }

    if (this.changedProperties.has('color')) {
      this.targetTrack.setColor(this.originalProperties.color ?? undefined);
      restoredProperties.push(`color: ${this.originalProperties.color ?? 'none'}`);
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
    if (this.newProperties.muted !== undefined) {
      updatedProps.push('muted');
    }
    if (this.newProperties.solo !== undefined) {
      updatedProps.push('solo');
    }
    if ('color' in this.newProperties) {
      updatedProps.push('color');
    }
    if (this.newProperties.noTranspose !== undefined) {
      updatedProps.push('no transpose');
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
