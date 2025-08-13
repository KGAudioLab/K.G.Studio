import * as Tone from 'tone';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import type { InstrumentType } from '../track/KGMidiTrack';
import { KGToneSamplerFactory } from './KGToneSamplerFactory';

// InstrumentType is defined in KGMidiTrack and re-used here

/**
 * KGAudioBus - Represents a complete audio bus for a track
 * Replaces the separate trackSynths, trackInstruments, trackVolumes, trackMuted, trackSolo maps
 * Each instance manages a single track's audio processing chain
 */
export class KGAudioBus {
  // Core audio components
  private sampler: Tone.Sampler;
  private instrument: InstrumentType;
  
  // Audio properties
  private volume: number;
  private muted: boolean;
  private solo: boolean;
  
  // Audio processing chain (for future expansion)
  // private gain: Tone.Gain;
  // private filter: Tone.Filter;
  
  /**
   * Private constructor - use KGAudioBus.create() instead
   */
  private constructor(
    sampler: Tone.Sampler,
    instrument: InstrumentType,
    volume: number,
    muted: boolean,
    solo: boolean
  ) {
    this.sampler = sampler;
    this.instrument = instrument;
    this.volume = volume;
    this.muted = muted;
    this.solo = solo;
    
    // Set initial volume on the sampler
    this.updateSamplerVolume();
    
    console.log(`KGAudioBus created for ${instrument} - volume: ${volume}, muted: ${muted}, solo: ${solo}`);
  }

  /**
   * Create a new KGAudioBus instance (async factory method)
   * This is the main way to create audio buses since we need to wait for sampler creation
   */
  public static async create(
    instrument: InstrumentType = 'acoustic_grand_piano',
    volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME,
    muted: boolean = false,
    solo: boolean = false
  ): Promise<KGAudioBus> {
    try {
      console.log(`Creating KGAudioBus for ${instrument}...`);
      
      // Create the sampler using the factory
       const samplerFactory = KGToneSamplerFactory.instance();
       const sampler = await samplerFactory.createSampler(String(instrument));
      
      // Create the audio bus instance
      const audioBus = new KGAudioBus(sampler, instrument, volume, muted, solo);
      
      console.log(`KGAudioBus created successfully for ${instrument}`);
      return audioBus;
      
    } catch (error) {
      console.error(`Failed to create KGAudioBus for ${instrument}:`, error);
      throw error;
    }
  }

  // ===== AUDIO PLAYBACK =====

  /**
   * Trigger a note on this audio bus
   */
  public triggerAttackRelease(
    note: string, 
    duration: Tone.Unit.Time, 
    time?: number, 
    velocity?: number
  ): void {
    if (!this.shouldPlay()) {
      return; // Don't play if muted or should be silent due to solo logic
    }
    
    try {
      this.sampler.triggerAttackRelease(note, duration, time, velocity);
    } catch (error) {
      console.error(`Error triggering note ${note} on ${this.instrument}:`, error);
    }
  }

  /**
   * Trigger note attack (start playing) without automatic release
   * Used for sustained notes like piano key presses
   */
  public triggerAttack(
    note: string, 
    time?: number, 
    velocity?: number
  ): void {
    if (!this.shouldPlay()) {
      return; // Don't play if muted or should be silent due to solo logic
    }
    
    try {
      this.sampler.triggerAttack(note, time, velocity);
    } catch (error) {
      console.error(`Error triggering attack for note ${note} on ${this.instrument}:`, error);
    }
  }

  /**
   * Release a specific note
   * Used for ending sustained notes like piano key releases
   */
  public triggerRelease(
    note: string, 
    time?: number
  ): void {
    try {
      this.sampler.triggerRelease(note, time);
    } catch (error) {
      console.error(`Error releasing note ${note} on ${this.instrument}:`, error);
    }
  }

  /**
   * Release all currently playing notes
   */
  public releaseAll(): void {
    try {
      this.sampler.releaseAll();
    } catch (error) {
      console.error(`Error releasing all notes on ${this.instrument}:`, error);
    }
  }

  // ===== AUDIO PROPERTIES =====

  /**
   * Set the volume for this audio bus
   */
  public setVolume(volume: number): void {
    this.volume = volume;
    this.updateSamplerVolume();
    console.log(`Set ${this.instrument} volume to ${volume}`);
  }

  /**
   * Get the current volume
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Set the mute state for this audio bus
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateSamplerVolume();
    console.log(`Set ${this.instrument} muted to ${muted}`);
  }

  /**
   * Get the current mute state
   */
  public getMuted(): boolean {
    return this.muted;
  }

  /**
   * Set the solo state for this audio bus
   */
  public setSolo(solo: boolean): void {
    this.solo = solo;
    console.log(`Set ${this.instrument} solo to ${solo}`);
  }

  /**
   * Get the current solo state
   */
  public getSolo(): boolean {
    return this.solo;
  }

  /**
   * Get the current instrument type
   */
  public getInstrument(): InstrumentType {
    return this.instrument;
  }

  /**
   * Change the instrument for this audio bus
   */
  public async setInstrument(newInstrument: InstrumentType): Promise<void> {
    try {
      console.log(`Changing instrument from ${this.instrument} to ${newInstrument}...`);
      
      // Dispose of the current sampler
      this.sampler.dispose();
      
      // Create new sampler with new instrument
      const samplerFactory = KGToneSamplerFactory.instance();
      this.sampler = await samplerFactory.createSampler(String(newInstrument));
      this.instrument = newInstrument;
      
      // Restore volume settings
      this.updateSamplerVolume();
      
      console.log(`Instrument changed successfully to ${newInstrument}`);
    } catch (error) {
      console.error(`Failed to change instrument to ${newInstrument}:`, error);
      throw error;
    }
  }

  // ===== AUDIO ROUTING =====

  /**
   * Connect this audio bus to a destination (gain node, master output, etc.)
   */
  public connect(destination: Tone.InputNode): void {
    try {
      this.sampler.connect(destination);
      console.log(`Connected ${this.instrument} to audio destination`);
    } catch (error) {
      console.error(`Error connecting ${this.instrument} to destination:`, error);
    }
  }

  /**
   * Disconnect this audio bus from all destinations
   */
  public disconnect(): void {
    try {
      this.sampler.disconnect();
      console.log(`Disconnected ${this.instrument} from all destinations`);
    } catch (error) {
      console.error(`Error disconnecting ${this.instrument}:`, error);
    }
  }

  /**
   * Connect to the main output
   */
  public toDestination(): void {
    try {
      this.sampler.toDestination();
      console.log(`Connected ${this.instrument} to main output`);
    } catch (error) {
      console.error(`Error connecting ${this.instrument} to main output:`, error);
    }
  }

  // ===== RESOURCE MANAGEMENT =====

  /**
   * Dispose of this audio bus and clean up resources
   */
  public dispose(): void {
    try {
      this.sampler.dispose();
      console.log(`Disposed KGAudioBus for ${this.instrument}`);
    } catch (error) {
      console.error(`Error disposing KGAudioBus for ${this.instrument}:`, error);
    }
  }

  // ===== PRIVATE UTILITY METHODS =====

  /**
   * Update the sampler volume based on current volume and mute state
   */
  private updateSamplerVolume(): void {
    try {
      const effectiveVolume = this.muted ? 0 : this.volume;
      const volumeDb = effectiveVolume > 0 ? 20 * Math.log10(effectiveVolume) : -Infinity;
      this.sampler.volume.value = volumeDb;
    } catch (error) {
      console.error(`Error updating volume for ${this.instrument}:`, error);
    }
  }

  /**
   * Apply effective volume considering both mute and solo context
   * When any track is soloed, only soloed tracks should be audible
   */
  public applyEffectiveVolume(hasSoloedTracks: boolean): void {
    try {
      let effectiveVolume = this.volume;
      if (this.muted) {
        effectiveVolume = 0;
      } else if (hasSoloedTracks && !this.solo) {
        effectiveVolume = 0;
      }
      const volumeDb = effectiveVolume > 0 ? 20 * Math.log10(effectiveVolume) : -Infinity;
      this.sampler.volume.value = volumeDb;
    } catch (error) {
      console.error(`Error applying effective volume for ${this.instrument}:`, error);
    }
  }

  /**
   * Check if this audio bus should play (handles mute state)
   * Note: Solo logic should be handled at the audio interface level
   */
  private shouldPlay(): boolean {
    return !this.muted;
  }

  /**
   * Check if this audio bus should play considering solo logic
   * Called by audio interface with knowledge of other tracks' solo states
   */
  public shouldPlayWithSolo(hasSoloedTracks: boolean): boolean {
    if (this.muted) {
      return false; // Muted tracks never play
    }
    
    if (hasSoloedTracks) {
      return this.solo; // Only soloed tracks play when any track is soloed
    }
    
    return true; // All non-muted tracks play when no tracks are soloed
  }

  // ===== GETTERS FOR DEBUGGING =====

  /**
   * Get the underlying Tone.Sampler (for debugging/advanced use)
   */
  public getSampler(): Tone.Sampler {
    return this.sampler;
  }

  /**
   * Get a summary of this audio bus state
   */
  public getState(): {
    instrument: InstrumentType;
    volume: number;
    muted: boolean;
    solo: boolean;
  } {
    return {
      instrument: this.instrument,
      volume: this.volume,
      muted: this.muted,
      solo: this.solo
    };
  }
}