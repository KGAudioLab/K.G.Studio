import type { KGProject } from '../KGProject';
import type { KGMidiNote } from '../midi/KGMidiNote';
import { TIME_CONSTANTS, AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { pitchToNoteNameString } from '../../util/midiUtil';
import * as Tone from 'tone';
import { KGAudioBus } from './KGAudioBus';
import type { InstrumentType } from '../track/KGMidiTrack';
import { KGCore } from '../KGCore';
import { ConfigManager } from '../config/ConfigManager';

/**
 * KGAudioInterface - Audio engine interface for the DAW
 * Implements the singleton pattern for global audio management
 * Abstracts audio engine implementation (Tone.js) for potential future replacement
 */
export class KGAudioInterface {
  // Private static instance for singleton pattern
  private static _instance: KGAudioInterface | null = null;

  // Audio engine state
  private isInitialized: boolean = false;
  private isAudioContextStarted: boolean = false;

  // Track management - now using KGAudioBus
  private trackAudioBuses: Map<string, KGAudioBus> = new Map();

  // Playback state
  private isPlaying: boolean = false;
  private masterVolume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_MASTER_VOLUME;
  private scheduledEvents: Set<number> = new Set(); // Tone event IDs

  // Master volume control
  private masterGain: Tone.Gain | null = null;

  // Audio capture for screen sharing
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private captureStream: MediaStream | null = null;

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("KGAudioInterface initialized");
  }

  /**
   * Get the singleton instance of KGAudioInterface
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): KGAudioInterface {
    if (!KGAudioInterface._instance) {
      KGAudioInterface._instance = new KGAudioInterface();
    }
    return KGAudioInterface._instance;
  }

  // ===== INITIALIZATION =====

  /**
   * Initialize the audio engine (Tone.js)
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Set up master gain for volume control
      this.masterGain = new Tone.Gain(this.masterVolume).toDestination();
      
      // Configure transport settings
      Tone.Transport.bpm.value = TIME_CONSTANTS.DEFAULT_BPM; // Default BPM
      Tone.Transport.timeSignature = [TIME_CONSTANTS.DEFAULT_TIME_SIGNATURE.numerator, TIME_CONSTANTS.DEFAULT_TIME_SIGNATURE.denominator]; // Default time signature
      
      // Check config and setup audio capture if enabled
      const configManager = ConfigManager.instance();
      const enableCapture = configManager.get('audio.enable_audio_capture_for_screen_sharing') as boolean;
      
      if (enableCapture) {
        this.setupAudioCapture();
      }
      
      this.isInitialized = true;
      console.log("Audio engine initialized successfully");
    } catch (error) {
      console.error("Failed to initialize audio engine:", error);
      throw error;
    }
  }

  /**
   * Start the audio context (required for Web Audio)
   */
  public async startAudioContext(): Promise<void> {
    if (this.isAudioContextStarted) {
      return;
    }

    try {
      await Tone.start();
      this.isAudioContextStarted = true;
      console.log("Audio context started successfully");
    } catch (error) {
      console.error("Failed to start audio context:", error);
      throw error;
    }
  }

  /**
   * Clean up audio resources
   */
  public async dispose(): Promise<void> {
    try {
      // Stop playback
      this.stopPlayback();
      
      // Clear all scheduled events
      this.clearScheduledEvents();
      
      // Dispose of all audio buses
      this.trackAudioBuses.forEach(audioBus => {
        audioBus.dispose();
      });
      this.trackAudioBuses.clear();
      
      // Dispose master gain
      if (this.masterGain) {
        this.masterGain.dispose();
        this.masterGain = null;
      }
      
      // Clean up capture resources
      if (this.captureDestination) {
        this.captureDestination = null;
        this.captureStream = null;
      }
      
      this.isInitialized = false;
      this.isAudioContextStarted = false;
      
      console.log("Audio resources disposed successfully");
    } catch (error) {
      console.error("Error disposing audio resources:", error);
    }
  }

  // ===== TRACK MANAGEMENT =====

  /**
   * Create a synth/sampler for a track (backward compatibility wrapper)
   */
  public async createTrackSynth(trackId: string, instrumentType: InstrumentType): Promise<void> {
    await this.createTrackAudioBus(trackId, instrumentType);
  }

  /**
   * Remove a track's synth (backward compatibility wrapper)
   */
  public async removeTrackSynth(trackId: string): Promise<void> {
    await this.removeTrackAudioBus(trackId);
  }

  /**
   * Create an audio bus for a track (replaces createTrackSynth)
   */
  public async createTrackAudioBus(trackId: string, instrumentType: InstrumentType): Promise<void> {
    // Remove existing audio bus if it exists
    await this.removeTrackAudioBus(trackId);
    
    try {
      console.log(`Creating audio bus for track ${trackId} with instrument ${instrumentType}`);
      
      // Create new audio bus
      // Initialize with track's stored volume if available
      const project = KGCore.instance().getCurrentProject();
      const track = project.getTracks().find(t => t.getId().toString() === trackId);
      const initialVolume = track ? track.getVolume() : AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
      const audioBus = await KGAudioBus.create(instrumentType, initialVolume);
      
      // Connect to master gain if available, otherwise to destination
      if (this.masterGain) {
        audioBus.connect(this.masterGain);
      } else {
        audioBus.toDestination();
      }
      
      // Store the audio bus
      this.trackAudioBuses.set(trackId, audioBus);
      
      console.log(`Created audio bus for track ${trackId} with ${instrumentType}`);
    } catch (error) {
      console.error(`Failed to create audio bus for track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a track's audio bus (replaces removeTrackSynth)
   */
  public async removeTrackAudioBus(trackId: string): Promise<void> {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (audioBus) {
        // Dispose of the audio bus
        audioBus.dispose();
        
        // Remove from map
        this.trackAudioBuses.delete(trackId);
        
        console.log(`Removed audio bus for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error removing audio bus for track ${trackId}:`, error);
    }
  }

  /**
   * Change instrument type for a track (replaces setTrackInstrument)
   */
  public async setTrackInstrument(trackId: string, instrumentType: InstrumentType): Promise<void> {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (audioBus) {
        await audioBus.setInstrument(instrumentType);

        // reconnect to master gain
        if (this.masterGain) {
          audioBus.connect(this.masterGain);
        } else {
          audioBus.toDestination();
        }

        console.log(`Changed track ${trackId} instrument to ${instrumentType}`);
      } else {
        // Create new audio bus if it doesn't exist
        await this.createTrackAudioBus(trackId, instrumentType);
      }
    } catch (error) {
      console.error(`Failed to change instrument for track ${trackId}:`, error);
      throw error;
    }
  }

  // ===== PLAYBACK CONTROL =====

  /**
   * Prepare playback by scheduling all MIDI events
   */
  public preparePlayback(project: KGProject, startPosition: number): void {
    // Clear any existing scheduled events
    this.clearScheduledEvents();

    console.log("Preparing playback");
    
    try {
      // Set project BPM and time signature FIRST (this affects timing calculations)
      Tone.Transport.bpm.value = project.getBpm();
      const timeSignature = project.getTimeSignature();
      Tone.Transport.timeSignature = [timeSignature.numerator, timeSignature.denominator];
      
      console.log(`Setting Tone.js BPM to ${project.getBpm()}, actual value: ${Tone.Transport.bpm.value}`);
      
      // Set transport position (convert beats to Tone.js format)
      this.setTransportPosition(startPosition);
      
      // Schedule all MIDI events
      project.getTracks().forEach(track => {
        const trackId = track.getId().toString();
        const audioBus = this.trackAudioBuses.get(trackId);

        console.log(`Track ${trackId} has audio bus: ${audioBus ? 'true' : 'false'}; type: ${track.getType()}`);
        
        if (audioBus && track.getType() === 'MIDI') {
          track.getRegions().forEach(region => {
            console.log(`Region ${region.getId().toString()}: type: ${region.getCurrentType()}`);

            if (region.getCurrentType() === 'KGMidiRegion') {
              const midiRegion = region as unknown as { getNotes: () => KGMidiNote[] };
              
              // Get notes from region (assuming it has a getNotes method)
              if (midiRegion.getNotes) {
                midiRegion.getNotes().forEach((note: KGMidiNote) => {
                  // Calculate absolute note timing in beats (note position + region start position)
                  const regionStartBeat = region.getStartFromBeat();
                  const noteStartBeat = note.getStartBeat() + regionStartBeat;
                  const noteDurationBeats = note.getEndBeat() - note.getStartBeat();
                  
                  // Only schedule notes that start at or after the playback start position
                  if (noteStartBeat < startPosition) {
                    return; // Skip notes that would have already finished before playback starts
                  }
                  
                  // Convert beats to Tone.js time format for scheduling
                  const noteStartTime = this.beatsToToneTime(noteStartBeat);
                  const noteDuration = this.beatsToToneTime(noteDurationBeats);
                  
                  // Convert MIDI note number to note name
                  const noteName = pitchToNoteNameString(note.getPitch());
                  const velocity = note.getVelocity() / 127; // Normalize to 0-1
                  
                  console.log(
                    `Scheduling note ${noteName} at beat ${Number(noteStartBeat.toFixed ? noteStartBeat.toFixed(3) : noteStartBeat.toLocaleString(undefined, {maximumFractionDigits: 3}))}, Tone time: ${Number(Number(noteStartTime).toFixed(3))}, duration: ${Number(Number(noteDuration).toFixed(3))}`
                  );
                  
                  // Schedule the note
                  const eventId = Tone.Transport.schedule((time) => {
                    // Check if track should play considering solo logic
                    const hasSoloedTracks = this.hasSoloedTracks();
                    if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                      audioBus.triggerAttackRelease(noteName, noteDuration, time, velocity);
                    }
                  }, noteStartTime);
                  
                  this.scheduledEvents.add(eventId);
                });
              }
            }
          });
        }
      });
      
      console.log(`Prepared playback from position ${startPosition} with ${this.scheduledEvents.size} events`);
    } catch (error) {
      console.error('Error preparing playback:', error);
    }
  }

  /**
   * Start playback
   */
  public startPlayback(): void {
    try {
      if (!this.isInitialized) {
        throw new Error('Audio interface not initialized');
      }
      
      if (!this.isAudioContextStarted) {
        throw new Error('Audio context not started');
      }
      
      Tone.Transport.start();
      this.isPlaying = true;
      
      console.log('Audio playback started');
    } catch (error) {
      console.error('Error starting playback:', error);
      throw error;
    }
  }

  /**
   * Stop playback
   */
  public stopPlayback(): void {
    try {
      Tone.Transport.stop();
      
      // Release all currently playing notes
      this.trackAudioBuses.forEach(audioBus => {
        audioBus.releaseAll();
      });
      
      this.isPlaying = false;
      
      console.log('Audio playback stopped');
    } catch (error) {
      console.error('Error stopping playback:', error);
    }
  }

  /**
   * Trigger a single MIDI note
   */
  public triggerNote(trackId: string, note: KGMidiNote, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }
      
      const noteName = pitchToNoteNameString(note.getPitch());
      const velocity = note.getVelocity() / 127; // Normalize to 0-1
      
      // Convert note duration from beats to Tone.js time format
      const durationInBeats = note.getEndBeat() - note.getStartBeat();
      const duration = this.beatsToToneTime(durationInBeats);
      const triggerTime = time ?? Tone.now();
      
      // Check if track should play considering solo logic
      const hasSoloedTracks = this.hasSoloedTracks();
      if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
        audioBus.triggerAttackRelease(noteName, duration, triggerTime, velocity);
        console.log(`Triggered note ${noteName} for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error triggering note for track ${trackId}:`, error);
    }
  }

  /**
   * Trigger note attack (start playing) without automatic release
   * Used for piano key press
   */
  public triggerNoteAttack(trackId: string, pitch: number, velocity: number = 127, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }
      
      const noteName = pitchToNoteNameString(pitch);
      const normalizedVelocity = velocity / 127; // Normalize to 0-1
      const triggerTime = time ?? Tone.now();
      
      // Check if track should play considering solo logic
      const hasSoloedTracks = this.hasSoloedTracks();
      if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
        audioBus.triggerAttack(noteName, triggerTime, normalizedVelocity);
        console.log(`Triggered attack for note ${noteName} (pitch ${pitch}) on track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error triggering note attack for track ${trackId}:`, error);
    }
  }

  /**
   * Release a specific note
   * Used for piano key release
   */
  public releaseNote(trackId: string, pitch: number, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }
      
      const noteName = pitchToNoteNameString(pitch);
      const releaseTime = time ?? Tone.now();
      
      audioBus.triggerRelease(noteName, releaseTime);
      console.log(`Released note ${noteName} (pitch ${pitch}) on track ${trackId}`);
    } catch (error) {
      console.error(`Error releasing note for track ${trackId}:`, error);
    }
  }

  /**
   * Clear all scheduled events
   */
  public clearScheduledEvents(): void {
    try {
      // Cancel all scheduled events
      this.scheduledEvents.forEach(eventId => {
        Tone.Transport.clear(eventId);
      });
      
      // Clear the set
      this.scheduledEvents.clear();
      
      console.log('Cleared all scheduled events');
    } catch (error) {
      console.error('Error clearing scheduled events:', error);
    }
  }

  // ===== TRANSPORT CONTROL =====

  /**
   * Set transport position
   */
  public setTransportPosition(position: number): void {
    try {
      // Convert beats to Tone.js time format
      const toneTime = this.beatsToToneTime(position);
      Tone.Transport.position = toneTime;
      console.log(`Set transport position to ${position} beats (${toneTime})`);
    } catch (error) {
      console.error('Error setting transport position:', error);
    }
  }

  /**
   * Get current transport position
   */
  public getTransportPosition(): number {
    try {
      const position = Tone.Transport.position;
      return this.toneTimeToBeats(position);
    } catch (error) {
      console.error('Error getting transport position:', error);
      return 0;
    }
  }

  /**
   * Set transport BPM
   */
  public setBpm(bpm: number): void {
    try {
      Tone.Transport.bpm.value = bpm;
      console.log(`Set BPM to ${bpm}`);
    } catch (error) {
      console.error('Error setting BPM:', error);
    }
  }

  // ===== TRACK PROPERTIES =====

  /**
   * Set track volume
   */
  public setTrackVolume(trackId: string, volume: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (audioBus) {
        audioBus.setVolume(volume);
        console.log(`Set track ${trackId} volume to ${volume}`);
      } else {
        console.warn(`No audio bus found for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error setting track ${trackId} volume:`, error);
    }
  }

  /**
   * Set track mute state
   */
  public setTrackMute(trackId: string, muted: boolean): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (audioBus) {
        audioBus.setMuted(muted);
        console.log(`Set track ${trackId} mute to ${muted}`);
        // Recompute effective volumes across all buses (solo logic)
        this.updateAllEffectiveVolumes();
      } else {
        console.warn(`No audio bus found for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error setting track ${trackId} mute:`, error);
    }
  }

  /**
   * Set track solo state
   */
  public setTrackSolo(trackId: string, solo: boolean): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (audioBus) {
        audioBus.setSolo(solo);
        console.log(`Set track ${trackId} solo to ${solo}`);
        // Recompute effective volumes across all buses (solo logic)
        this.updateAllEffectiveVolumes();
      } else {
        console.warn(`No audio bus found for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error setting track ${trackId} solo:`, error);
    }
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volume: number): void {
    try {
      if (this.masterGain) {
        this.masterGain.gain.value = volume;
      }
      
      this.masterVolume = volume;
      console.log(`Set master volume to ${volume}`);
    } catch (error) {
      console.error('Error setting master volume:', error);
    }
  }

  // ===== GETTERS =====

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getIsAudioContextStarted(): boolean {
    return this.isAudioContextStarted;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getTrackInstrument(trackId: string): InstrumentType | undefined {
    const audioBus = this.trackAudioBuses.get(trackId);
    return audioBus?.getInstrument();
  }

  public getTrackVolume(trackId: string): number {
    const audioBus = this.trackAudioBuses.get(trackId);
    return audioBus?.getVolume() ?? AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
  }

  public getTrackMuted(trackId: string): boolean {
    const audioBus = this.trackAudioBuses.get(trackId);
    return audioBus?.getMuted() ?? false;
  }

  public getTrackSolo(trackId: string): boolean {
    const audioBus = this.trackAudioBuses.get(trackId);
    return audioBus?.getSolo() ?? false;
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public getAvailableInstruments(): InstrumentType[] {
    return Object.keys(FLUIDR3_INSTRUMENT_MAP) as InstrumentType[];
  }

  public getCaptureStream(): MediaStream | null {
    return this.captureStream;
  }

  // ===== PRIVATE UTILITY METHODS =====

  /**
   * Setup audio capture for screen sharing
   */
  private setupAudioCapture(): void {
    if (this.masterGain && !this.captureDestination) {
      this.captureDestination = Tone.getContext().createMediaStreamDestination();
      this.captureStream = this.captureDestination.stream;
      
      // Connect master gain to both speakers AND capture destination
      this.masterGain.connect(this.captureDestination);
      
      console.log('Audio capture enabled for screen sharing');
    }
  }

  /**
   * Check if any tracks are currently soloed
   */
  private hasSoloedTracks(): boolean {
    return Array.from(this.trackAudioBuses.values()).some(audioBus => audioBus.getSolo());
  }

  /**
   * Update effective volume for all tracks according to mute/solo state
   */
  private updateAllEffectiveVolumes(): void {
    try {
      const hasSoloedTracks = this.hasSoloedTracks();
      this.trackAudioBuses.forEach(bus => bus.applyEffectiveVolume(hasSoloedTracks));
    } catch (error) {
      console.error('Error updating effective volumes:', error);
    }
  }

  // ===== TIME CONVERSION UTILITIES =====

  /**
   * Convert beats to Tone.js time format using raw seconds
   * This approach handles triplets and all subdivisions correctly
   */
  private beatsToToneTime(beats: number): Tone.Unit.Time {
    const project = KGCore.instance().getCurrentProject();
    const bpm = project.getBpm();
    
    // Calculate seconds per beat - BPM is always quarter note beats per minute
    // Time signature denominator doesn't affect BPM, only subdivision
    const secondsPerBeat = 60 / bpm;
    
    // Convert beats directly to seconds
    const totalSeconds = beats * secondsPerBeat;
    
    return totalSeconds as Tone.Unit.Time;
  }

  /**
   * Convert Tone.js time format to beats
   */
  private toneTimeToBeats(toneTime: Tone.Unit.Time): number {
    const project = KGCore.instance().getCurrentProject();
    const bpm = project.getBpm();
    
    // Calculate seconds per beat - BPM is always quarter note beats per minute
    // Time signature denominator doesn't affect BPM, only subdivision
    const secondsPerBeat = 60 / bpm;
    
    // Tone.Time() can handle both numbers and strings
    const seconds = Tone.Time(toneTime).toSeconds();
    const beats = seconds / secondsPerBeat;
    
    return beats;
  }

  /**
   * Get current BPM from Tone.js transport
   */
  public getCurrentBpm(): number {
    return Tone.Transport.bpm.value;
  }

  /**
   * Debug method to check BPM setting
   */
  public debugBpm(): void {
    console.log('=== BPM Debug Info ===');
    console.log('Tone.Transport.bpm.value:', Tone.Transport.bpm.value);
    console.log('Tone.Transport.state:', Tone.Transport.state);
    console.log('Audio context sample rate:', Tone.getContext().sampleRate);
    console.log('Audio context state:', Tone.getContext().state);
  }
}