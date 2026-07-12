import * as Tone from 'tone';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import type { InstrumentType } from '../track/KGMidiTrack';
import { KGToneBuffersPool } from './KGToneBuffersPool';
import { KGToneSamplerFactory } from './KGToneSamplerFactory';
import { createStereoTrackPanner } from './createStereoTrackPanner';
import { resolveInstrumentDefinition, resolvePlaybackInstrument } from '../instruments/instrumentResolver';

// InstrumentType is defined in KGMidiTrack and re-used here

interface LiveMidiSource {
  source: Tone.ToneBufferSource;
  gainNode: Tone.Gain;
  basePlaybackRate: number;
  isPressed: boolean;
  pendingSustainRelease: boolean;
}

/**
 * KGAudioBus - Represents a complete audio bus for a track
 * Replaces the separate trackSynths, trackInstruments, trackVolumes, trackMuted, trackSolo maps
 * Each instance manages a single track's audio processing chain
 */
export class KGAudioBus {
  // Fixed at +/-2 semitones for now. Future work: make this user-configurable
  // or honor MIDI RPN 0,0 (Pitch Bend Sensitivity).
  public static readonly LIVE_MIDI_PITCH_BEND_RANGE_SEMITONES = 2;
  private static readonly LIVE_MIDI_NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Core audio components
  private sampler: Tone.Sampler;
  private audioBuffers: Tone.ToneAudioBuffers;
  private instrument: InstrumentType;
  private panner: Tone.Panner;
  
  // Audio properties
  private volume: number;
  private automationVolume: number | null = null;
  private pan: number;
  private automationPan: number | null = null;
  private muted: boolean;
  private solo: boolean;
  private liveMidiPitchBend: number = 0;
  private liveExpressionNormalized: number = 1;
  private sustainPedalDown: boolean = false;
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
    panner: Tone.Panner,
    volume: number,
    pan: number,
    muted: boolean,
    solo: boolean
  ) {
    this.sampler = sampler;
    this.audioBuffers = audioBuffers;
    this.instrument = instrument;
    this.panner = panner;
    this.volume = volume;
    this.pan = pan;
    this.muted = muted;
    this.solo = solo;
    
    // Set initial volume on the sampler
    this.updateSamplerVolume();
    this.updatePanValue();
    
    console.log(`KGAudioBus created for ${instrument} - volume: ${volume}, muted: ${muted}, solo: ${solo}`);
  }

  /**
   * Create a new KGAudioBus instance (async factory method)
   * This is the main way to create audio buses since we need to wait for sampler creation
   */
  public static async create(
    instrument: InstrumentType = 'acoustic_grand_piano',
    volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME,
    pan: number = 0,
    muted: boolean = false,
    solo: boolean = false
  ): Promise<KGAudioBus> {
    try {
      console.log(`Creating KGAudioBus for ${instrument}...`);
      
      // Create the sampler using the factory
      const samplerFactory = KGToneSamplerFactory.instance();
      const buffersPool = KGToneBuffersPool.instance();
      const playbackInstrument = resolvePlaybackInstrument(String(instrument));
      const [sampler, audioBuffers] = await Promise.all([
        samplerFactory.createSampler(playbackInstrument),
        buffersPool.getToneAudioBuffers(playbackInstrument),
      ]);
      
      // Create the audio bus instance
      const panner = createStereoTrackPanner(pan);
      sampler.connect(panner);
      const audioBus = new KGAudioBus(sampler, audioBuffers, instrument, panner, volume, pan, muted, solo);
      
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
    velocity?: number,
    hasSoloedTracks: boolean = false,
  ): void {
    if (!this.shouldPlayWithSolo(hasSoloedTracks)) {
      return;
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
    velocity?: number,
    hasSoloedTracks: boolean = false,
  ): void {
    if (!this.shouldPlayWithSolo(hasSoloedTracks)) {
      return;
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
    velocity?: number,
    hasSoloedTracks: boolean = false,
  ): void {
    this.triggerPitchBendAwareAttack(pitch, time, velocity, undefined, hasSoloedTracks);
  }

  public triggerPitchBendAwareAttack(
    pitch: number,
    time?: number,
    velocity?: number,
    duration?: number,
    hasSoloedTracks: boolean = false,
  ): void {
    if (!this.shouldPlayWithSolo(hasSoloedTracks)) {
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

      const liveSource = [...activeSources].reverse().find((entry) => entry.isPressed) ?? activeSources[activeSources.length - 1];
      if (!liveSource) {
        return;
      }

      liveSource.isPressed = false;
      if (this.sustainPedalDown) {
        liveSource.pendingSustainRelease = true;
        return;
      }

      this.stopLiveMidiSource(pitch, liveSource, time ?? Tone.now());
    } catch (error) {
      console.error(`Error releasing live MIDI note ${pitch} on ${this.instrument}:`, error);
    }
  }

  public setLiveMidiPitchBend(normalizedBend: number): void {
    this.liveMidiPitchBend = Math.max(-1, Math.min(1, normalizedBend));

    for (const activeSources of this.liveMidiSources.values()) {
      activeSources.forEach(({ source, basePlaybackRate }) => {
        this.setPlaybackRateValue(source, this.applyPitchBendToPlaybackRate(basePlaybackRate));
      });
    }
  }

  public scheduleLiveMidiPitchBend(normalizedBend: number, time: number): void {
    this.liveMidiPitchBend = Math.max(-1, Math.min(1, normalizedBend));

    for (const activeSources of this.liveMidiSources.values()) {
      activeSources.forEach(({ source, basePlaybackRate }) => {
        this.setPlaybackRateValue(source, this.applyPitchBendToPlaybackRate(basePlaybackRate), time);
      });
    }
  }

  public resetLiveMidiPitchBend(): void {
    this.setLiveMidiPitchBend(0);
  }

  public setLiveMidiExpression(normalizedValue: number): void {
    this.liveExpressionNormalized = Math.max(0, Math.min(1, normalizedValue));

    for (const activeSources of this.liveMidiSources.values()) {
      activeSources.forEach(({ gainNode }) => {
        this.setGainValue(gainNode, this.liveExpressionNormalized);
      });
    }
  }

  public scheduleLiveMidiExpression(normalizedValue: number, time: number): void {
    this.liveExpressionNormalized = Math.max(0, Math.min(1, normalizedValue));

    for (const activeSources of this.liveMidiSources.values()) {
      activeSources.forEach(({ gainNode }) => {
        this.setGainValue(gainNode, this.liveExpressionNormalized, time);
      });
    }
  }

  public setLiveMidiSustain(isDown: boolean, time?: number): void {
    this.sustainPedalDown = isDown;
    if (isDown) {
      return;
    }

    const releaseTime = time ?? Tone.now();
    for (const [pitch, activeSources] of this.liveMidiSources.entries()) {
      [...activeSources]
        .filter((entry) => !entry.isPressed && entry.pendingSustainRelease)
        .forEach((entry) => this.stopLiveMidiSource(pitch, entry, releaseTime));
    }
  }

  /**
   * Release all currently playing notes
   */
  public releaseAll(): void {
    try {
      this.sampler.releaseAll();
      this.liveMidiSources.forEach((activeSources) => {
        activeSources.forEach(({ source, gainNode }) => {
          try {
            source.stop();
          } catch (error) {
            console.error(`Error stopping live MIDI source on ${this.instrument}:`, error);
          }
          gainNode.dispose();
        });
      });
      this.liveMidiSources.clear();
      this.resetLiveMidiPitchBend();
      this.liveExpressionNormalized = 1;
      this.sustainPedalDown = false;
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

  public setAutomationVolume(volume: number | null): void {
    this.automationVolume = volume;
    this.updateSamplerVolume();
  }

  /**
   * Get the current volume
   */
  public getVolume(): number {
    return this.volume;
  }

  public setPan(pan: number): void {
    this.pan = Math.max(-1, Math.min(1, pan));
    this.updatePanValue();
  }

  public setAutomationPan(pan: number | null): void {
    this.automationPan = pan === null ? null : Math.max(-1, Math.min(1, pan));
    this.updatePanValue();
  }

  public scheduleAutomationPan(pan: number, time: number): void {
    const clampedPan = Math.max(-1, Math.min(1, pan));
    this.automationPan = clampedPan;
    if (typeof this.panner.pan.setValueAtTime === 'function') {
      this.panner.pan.setValueAtTime(clampedPan, time);
      return;
    }

    this.panner.pan.value = clampedPan;
  }

  public getPan(): number {
    return this.pan;
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
      const playbackInstrument = resolvePlaybackInstrument(String(newInstrument));
      const [sampler, audioBuffers] = await Promise.all([
        samplerFactory.createSampler(playbackInstrument),
        buffersPool.getToneAudioBuffers(playbackInstrument),
      ]);
      this.sampler = sampler;
      this.audioBuffers = audioBuffers;
      this.instrument = newInstrument;
      this.sampler.connect(this.panner);
      
      // Restore volume settings
      this.updateSamplerVolume();
      this.updatePanValue();
      
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
      this.panner.connect(destination);
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
      this.panner.disconnect();
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
      this.panner.toDestination();
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
      this.panner.dispose();
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
      const effectiveVolume = this.automationVolume ?? this.volume;
      const isSilent = this.muted || effectiveVolume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.sampler.volume.value = isSilent ? -Infinity : effectiveVolume;
    } catch (error) {
      console.error(`Error updating volume for ${this.instrument}:`, error);
    }
  }

  private updatePanValue(): void {
    try {
      const effectivePan = this.automationPan ?? this.pan;
      if (typeof this.panner.pan.setValueAtTime === 'function') {
        this.panner.pan.setValueAtTime(effectivePan, Tone.now());
      } else {
        this.panner.pan.value = effectivePan;
      }
    } catch (error) {
      console.error(`Error updating pan for ${this.instrument}:`, error);
    }
  }

  /**
   * Apply effective volume considering both mute and solo context
   * When any track is soloed, only soloed tracks should be audible
   */
  public applyEffectiveVolume(hasSoloedTracks: boolean): void {
    try {
      const effectiveVolume = this.automationVolume ?? this.volume;
      const isSilent = (hasSoloedTracks ? !this.solo : this.muted) || effectiveVolume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.sampler.volume.value = isSilent ? -Infinity : effectiveVolume;
    } catch (error) {
      console.error(`Error applying effective volume for ${this.instrument}:`, error);
    }
  }

  /**
   * Check if this audio bus should play considering solo logic
   * Called by audio interface with knowledge of other tracks' solo states
   */
  public shouldPlayWithSolo(hasSoloedTracks: boolean): boolean {
    if (hasSoloedTracks) {
      return this.solo; // Only soloed tracks play when any track is soloed
    }
    
    return !this.muted; // All non-muted tracks play when no tracks are soloed
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
    pan: number;
    muted: boolean;
    solo: boolean;
  } {
    return {
      instrument: this.instrument,
      volume: this.volume,
      pan: this.pan,
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
    const closestPitch = KGAudioBus.findClosestBufferedPitch(this.instrument, this.audioBuffers, pitch);
    if (closestPitch === null) {
      console.warn(`No audio buffer found for live MIDI pitch ${pitch} on ${this.instrument}`);
      return null;
    }

    const bufferKey = KGAudioBus.midiPitchToBufferKey(closestPitch);
    const buffer = this.audioBuffers.get(bufferKey);
    if (!buffer) {
      console.warn(`Missing audio buffer ${bufferKey} for ${this.instrument}`);
      return null;
    }

    const basePlaybackRate = Math.pow(2, (pitch - closestPitch) / 12);
    const gainNode = new Tone.Gain(this.liveExpressionNormalized);
    const source = new Tone.ToneBufferSource({
      url: buffer,
      fadeIn: this.sampler.attack,
      fadeOut: this.sampler.release,
      curve: this.sampler.curve,
      playbackRate: this.applyPitchBendToPlaybackRate(basePlaybackRate),
    });

    source.connect(gainNode);
    gainNode.connect(this.sampler.output);

    source.onended = () => {
      const currentSources = this.liveMidiSources.get(pitch);
      if (!currentSources) {
        gainNode.dispose();
        return;
      }

      const nextSources = currentSources.filter((entry) => entry.source !== source);
      if (nextSources.length === 0) {
        this.liveMidiSources.delete(pitch);
      } else {
        this.liveMidiSources.set(pitch, nextSources);
      }
      gainNode.dispose();
    };

    source.start(time, 0, duration ?? buffer.duration / basePlaybackRate, velocity ?? 1);
    return {
      source,
      gainNode,
      basePlaybackRate,
      isPressed: true,
      pendingSustainRelease: false,
    };
  }

  public static applyNormalizedPitchBendToPlaybackRate(basePlaybackRate: number, normalizedBend: number): number {
    const bendSemitones = normalizedBend * KGAudioBus.LIVE_MIDI_PITCH_BEND_RANGE_SEMITONES;
    return basePlaybackRate * Math.pow(2, bendSemitones / 12);
  }

  private applyPitchBendToPlaybackRate(basePlaybackRate: number): number {
    return KGAudioBus.applyNormalizedPitchBendToPlaybackRate(basePlaybackRate, this.liveMidiPitchBend);
  }

  public static findClosestBufferedPitch(
    instrument: InstrumentType,
    audioBuffers: Tone.ToneAudioBuffers,
    targetPitch: number
  ): number | null {
    const [minPitch, maxPitch] = resolveInstrumentDefinition(String(instrument))?.pitchRange || [21, 108];
    const boundedPitch = Math.max(minPitch, Math.min(maxPitch, targetPitch));

    for (let offset = 0; offset <= 96; offset++) {
      const upwardPitch = boundedPitch + offset;
      if (upwardPitch <= maxPitch && audioBuffers.has(KGAudioBus.midiPitchToBufferKey(upwardPitch))) {
        return upwardPitch;
      }

      const downwardPitch = boundedPitch - offset;
      if (downwardPitch >= minPitch && audioBuffers.has(KGAudioBus.midiPitchToBufferKey(downwardPitch))) {
        return downwardPitch;
      }
    }

    return null;
  }

  public static midiPitchToBufferKey(pitch: number): string {
    const octave = Math.floor((pitch - 12) / 12);
    const noteIndex = (pitch - 12) % 12;
    return `${KGAudioBus.LIVE_MIDI_NOTE_NAMES[noteIndex]}${octave}`;
  }

  private setPlaybackRateValue(source: Tone.ToneBufferSource, value: number, time?: number): void {
    const playbackRate = source.playbackRate as unknown as {
      value: number;
      setValueAtTime?: (nextValue: number, nextTime: number) => void;
    };

    if (time !== undefined && typeof playbackRate.setValueAtTime === 'function') {
      playbackRate.setValueAtTime(value, time);
      return;
    }

    playbackRate.value = value;
  }

  private setGainValue(gainNode: Tone.Gain, value: number, time?: number): void {
    if (time !== undefined && typeof gainNode.gain.setValueAtTime === 'function') {
      gainNode.gain.setValueAtTime(value, time);
      return;
    }

    gainNode.gain.value = value;
  }

  private stopLiveMidiSource(pitch: number, liveSource: LiveMidiSource, time: number): void {
    try {
      liveSource.pendingSustainRelease = false;
      liveSource.source.stop(time);
    } catch (error) {
      console.error(`Error stopping live MIDI source for pitch ${pitch} on ${this.instrument}:`, error);
      const remainingSources = this.liveMidiSources.get(pitch)?.filter((entry) => entry !== liveSource) ?? [];
      if (remainingSources.length === 0) {
        this.liveMidiSources.delete(pitch);
      } else {
        this.liveMidiSources.set(pitch, remainingSources);
      }
      liveSource.gainNode.dispose();
    }
  }
}
