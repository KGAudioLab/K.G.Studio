import * as Tone from 'tone';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import type { InstrumentType } from '../track/KGMidiTrack';
import { KGToneBuffersPool } from './KGToneBuffersPool';
import { KGToneSamplerFactory } from './KGToneSamplerFactory';

// InstrumentType is defined in KGMidiTrack and re-used here

interface LiveMidiSource {
  source: Tone.ToneBufferSource;
  basePlaybackRate: number;
}

/**
 * KGAudioBus - Represents a complete audio bus for a track
 * Replaces the separate trackSynths, trackInstruments, trackVolumes, trackMuted, trackSolo maps
 * Each instance manages a single track's audio processing chain
 */
export class KGAudioBus {
  // Fixed at +/-2 semitones for now. Future work: make this user-configurable
  // or honor MIDI RPN 0,0 (Pitch Bend Sensitivity).
  private static readonly LIVE_MIDI_PITCH_BEND_RANGE_SEMITONES = 2;
  private static readonly LIVE_MIDI_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Core audio components
  private sampler: Tone.Sampler;
  private audioBuffers: Tone.ToneAudioBuffers;
  private instrument: InstrumentType;
  
  // Audio properties
  private volume: number;
  private muted: boolean;
  private solo: boolean;
  private liveMidiPitchBend: number = 0;
  private liveMidiSources: Map<number, LiveMidiSource[]> = new Map();
  
  // Audio processing chain (for future expansion)
  // private gain: Tone.Gain;
  // private filter: Tone.Filter;
  
  /**
   * Private constructor - use KGAudioBus.create() instead
   */
  private constructor(
    sampler: Tone.Sampler,
    audioBuffers: Tone.ToneAudioBuffers,
    instrument: InstrumentType,
    volume: number,
    muted: boolean,
    solo: boolean
  ) {
    this.sampler = sampler;
    this.audioBuffers = audioBuffers;
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
      const buffersPool = KGToneBuffersPool.instance();
      const [sampler, audioBuffers] = await Promise.all([
        samplerFactory.createSampler(String(instrument)),
        buffersPool.getToneAudioBuffers(String(instrument)),
      ]);
      
      // Create the audio bus instance
      const audioBus = new KGAudioBus(sampler, audioBuffers, instrument, volume, muted, solo);
      
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
   * Trigger note attack for live MIDI keyboard monitoring.
   * This path tracks the underlying buffer sources so pitch bend can retune held notes.
   */
  public triggerLiveMidiAttack(
    pitch: number,
    time?: number,
    velocity?: number
  ): void {
    this.triggerPitchBendAwareAttack(pitch, time, velocity);
  }

  public triggerPitchBendAwareAttack(
    pitch: number,
    time?: number,
    velocity?: number,
    duration?: number
  ): void {
    if (!this.shouldPlay()) {
      return;
    }

    try {
      const liveSource = this.createPitchBendAwareSource(pitch, time, velocity, duration);
      if (!liveSource) {
        return;
      }

      const activeSources = this.liveMidiSources.get(pitch) ?? [];
      activeSources.push(liveSource);
      this.liveMidiSources.set(pitch, activeSources);
    } catch (error) {
      console.error(`Error triggering live MIDI attack for pitch ${pitch} on ${this.instrument}:`, error);
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
   * Release a live MIDI note and forget any active bent sources tied to that pitch.
   */
  public releaseLiveMidiNote(pitch: number, time?: number): void {
    try {
      const activeSources = this.liveMidiSources.get(pitch);
      if (!activeSources || activeSources.length === 0) {
        return;
      }

      const stopTime = time ?? Tone.now();
      activeSources.forEach(({ source }) => {
        try {
          source.stop(stopTime);
        } catch (error) {
          console.error(`Error stopping live MIDI source for pitch ${pitch} on ${this.instrument}:`, error);
        }
      });
      this.liveMidiSources.delete(pitch);
    } catch (error) {
      console.error(`Error releasing live MIDI note ${pitch} on ${this.instrument}:`, error);
    }
  }

  public setLiveMidiPitchBend(normalizedBend: number): void {
    this.liveMidiPitchBend = Math.max(-1, Math.min(1, normalizedBend));

    for (const activeSources of this.liveMidiSources.values()) {
      activeSources.forEach(({ source, basePlaybackRate }) => {
        source.playbackRate.value = this.applyPitchBendToPlaybackRate(basePlaybackRate);
      });
    }
  }

  public resetLiveMidiPitchBend(): void {
    this.setLiveMidiPitchBend(0);
  }

  /**
   * Release all currently playing notes
   */
  public releaseAll(): void {
    try {
      this.sampler.releaseAll();
      this.liveMidiSources.forEach((activeSources) => {
        activeSources.forEach(({ source }) => {
          try {
            source.stop();
          } catch (error) {
            console.error(`Error stopping live MIDI source on ${this.instrument}:`, error);
          }
        });
      });
      this.liveMidiSources.clear();
      this.resetLiveMidiPitchBend();
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
      
      this.releaseAll();

      // Dispose of the current sampler
      this.sampler.dispose();
      
      // Create new sampler with new instrument
      const samplerFactory = KGToneSamplerFactory.instance();
      const buffersPool = KGToneBuffersPool.instance();
      const [sampler, audioBuffers] = await Promise.all([
        samplerFactory.createSampler(String(newInstrument)),
        buffersPool.getToneAudioBuffers(String(newInstrument)),
      ]);
      this.sampler = sampler;
      this.audioBuffers = audioBuffers;
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
      this.releaseAll();
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
      const isSilent = this.muted || this.volume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.sampler.volume.value = isSilent ? -Infinity : this.volume;
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
      const isSilent = this.muted || (hasSoloedTracks && !this.solo) || this.volume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.sampler.volume.value = isSilent ? -Infinity : this.volume;
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

  private createPitchBendAwareSource(
    pitch: number,
    time?: number,
    velocity?: number,
    duration?: number
  ): LiveMidiSource | null {
    const closestPitch = this.findClosestBufferedPitch(pitch);
    if (closestPitch === null) {
      console.warn(`No audio buffer found for live MIDI pitch ${pitch} on ${this.instrument}`);
      return null;
    }

    const bufferKey = this.midiPitchToBufferKey(closestPitch);
    const buffer = this.audioBuffers.get(bufferKey);
    if (!buffer) {
      console.warn(`Missing audio buffer ${bufferKey} for ${this.instrument}`);
      return null;
    }

    const basePlaybackRate = Math.pow(2, (pitch - closestPitch) / 12);
    const source = new Tone.ToneBufferSource({
      url: buffer,
      fadeIn: this.sampler.attack,
      fadeOut: this.sampler.release,
      curve: this.sampler.curve,
      playbackRate: this.applyPitchBendToPlaybackRate(basePlaybackRate),
    }).connect(this.sampler.output);

    source.onended = () => {
      const currentSources = this.liveMidiSources.get(pitch);
      if (!currentSources) {
        return;
      }

      const nextSources = currentSources.filter((entry) => entry.source !== source);
      if (nextSources.length === 0) {
        this.liveMidiSources.delete(pitch);
      } else {
        this.liveMidiSources.set(pitch, nextSources);
      }
    };

    source.start(time, 0, duration ?? buffer.duration / basePlaybackRate, velocity ?? 1);
    return { source, basePlaybackRate };
  }

  private applyPitchBendToPlaybackRate(basePlaybackRate: number): number {
    const bendSemitones = this.liveMidiPitchBend * KGAudioBus.LIVE_MIDI_PITCH_BEND_RANGE_SEMITONES;
    return basePlaybackRate * Math.pow(2, bendSemitones / 12);
  }

  private findClosestBufferedPitch(targetPitch: number): number | null {
    const [minPitch, maxPitch] = FLUIDR3_INSTRUMENT_MAP[this.instrument]?.pitchRange || [21, 108];
    const boundedPitch = Math.max(minPitch, Math.min(maxPitch, targetPitch));

    for (let offset = 0; offset <= 96; offset++) {
      const upwardPitch = boundedPitch + offset;
      if (upwardPitch <= maxPitch && this.audioBuffers.has(this.midiPitchToBufferKey(upwardPitch))) {
        return upwardPitch;
      }

      const downwardPitch = boundedPitch - offset;
      if (downwardPitch >= minPitch && this.audioBuffers.has(this.midiPitchToBufferKey(downwardPitch))) {
        return downwardPitch;
      }
    }

    return null;
  }

  private midiPitchToBufferKey(pitch: number): string {
    const octave = Math.floor((pitch - 12) / 12);
    const noteIndex = (pitch - 12) % 12;
    return `${KGAudioBus.LIVE_MIDI_NOTE_NAMES[noteIndex]}${octave}`;
  }
}
