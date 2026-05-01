import type { KGProject } from '../KGProject';
import type { KGMidiNote } from '../midi/KGMidiNote';
import { TIME_CONSTANTS, AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { pitchToNoteNameString } from '../../util/midiUtil';
import * as Tone from 'tone';
import { KGAudioBus } from './KGAudioBus';
import { KGAudioPlayerBus } from './KGAudioPlayerBus';
import type { InstrumentType } from '../track/KGMidiTrack';
import type { KGAudioRegion } from '../region/KGAudioRegion';
import { KGCore } from '../KGCore';
import { ConfigManager } from '../config/ConfigManager';
import { KGMetronome } from './KGMetronome';

/**
 * KGAudioInterface - Audio engine interface for the DAW
 * Implements the singleton pattern for global audio management
 * Abstracts audio engine implementation (Tone.js) for potential future replacement
 */
export class KGAudioInterface {
  /**
   * Avoid scheduling audio-region resume callbacks exactly on the current
   * transport boundary. Tone.Transport can miss those edge-triggered events,
   * which leaves the playhead moving but the resumed clip silent.
   */
  private static readonly AUDIO_RESUME_SAFETY_OFFSET_SECONDS = 0.005;

  // Private static instance for singleton pattern
  private static _instance: KGAudioInterface | null = null;

  // Audio engine state
  private isInitialized: boolean = false;
  private isAudioContextStarted: boolean = false;

  // Track management - now using KGAudioBus
  private trackAudioBuses: Map<string, KGAudioBus> = new Map();

  // Audio player buses for audio/wav tracks
  private trackAudioPlayerBuses: Map<string, KGAudioPlayerBus> = new Map();

  // Playback state
  private isPlaying: boolean = false;
  private masterVolume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_MASTER_VOLUME;
  private scheduledEvents: Set<number> = new Set(); // Tone event IDs
  private delayedTransportStartTimeoutId: number | null = null;
  private delayedTransportStartMs: number = 0;
  private virtualPrerollStartBeat: number | null = null;
  private virtualPrerollStartTimeMs: number | null = null;

  // Master volume control
  private masterGain: Tone.Gain | null = null;

  // Metronome
  private metronome: KGMetronome = new KGMetronome();
  private isMetronomeEnabled = false;

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
      const configManager = ConfigManager.instance();

      // Reduce lookahead time to 0.05 seconds to improve MIDI input responsiveness
      Tone.getContext().lookAhead = configManager.get('audio.lookahead_time') as number;

      // Set up master gain for volume control
      this.masterGain = new Tone.Gain(this.masterVolume).toDestination();
      
      // Configure transport settings
      Tone.Transport.bpm.value = TIME_CONSTANTS.DEFAULT_BPM; // Default BPM
      Tone.Transport.timeSignature = [TIME_CONSTANTS.DEFAULT_TIME_SIGNATURE.numerator, TIME_CONSTANTS.DEFAULT_TIME_SIGNATURE.denominator]; // Default time signature
      
      // Initialize metronome sampler in background (non-blocking)
      this.metronome.initialize(this.masterGain!).catch(err => {
        console.error('Failed to initialize metronome:', err);
      });

      // Check config and setup audio capture if enabled
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

      // Dispose of all audio player buses
      this.trackAudioPlayerBuses.forEach(playerBus => {
        playerBus.dispose();
      });
      this.trackAudioPlayerBuses.clear();
      
      // Dispose metronome
      this.metronome.dispose();

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

  // ===== AUDIO PLAYER BUS MANAGEMENT (for audio/wav tracks) =====

  /**
   * Create an audio player bus for an audio track
   */
  public async createTrackAudioPlayerBus(
    trackId: string,
    volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME
  ): Promise<void> {
    // Remove existing player bus if it exists
    await this.removeTrackAudioPlayerBus(trackId);

    try {
      console.log(`Creating audio player bus for track ${trackId}`);
      const playerBus = await KGAudioPlayerBus.create(volume);

      if (this.masterGain) {
        playerBus.connect(this.masterGain);
      }

      this.trackAudioPlayerBuses.set(trackId, playerBus);
      console.log(`Created audio player bus for track ${trackId}`);
    } catch (error) {
      console.error(`Failed to create audio player bus for track ${trackId}:`, error);
      throw error;
    }
  }

  /**
   * Remove an audio player bus
   */
  public async removeTrackAudioPlayerBus(trackId: string): Promise<void> {
    try {
      const playerBus = this.trackAudioPlayerBuses.get(trackId);
      if (playerBus) {
        playerBus.dispose();
        this.trackAudioPlayerBuses.delete(trackId);
        console.log(`Removed audio player bus for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error removing audio player bus for track ${trackId}:`, error);
    }
  }

  /**
   * Load an audio buffer into a track's player bus
   */
  public loadAudioBufferForTrack(
    trackId: string,
    audioFileId: string,
    buffer: Tone.ToneAudioBuffer
  ): void {
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    if (playerBus) {
      playerBus.loadBuffer(audioFileId, buffer);
    } else {
      console.warn(`No audio player bus found for track ${trackId}`);
    }
  }

  /**
   * Get the raw AudioBuffer for waveform rendering
   */
  public getAudioBuffer(trackId: string, audioFileId: string): AudioBuffer | undefined {
    // Try the specified track first
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    const buffer = playerBus?.getAudioBuffer(audioFileId);
    if (buffer) return buffer;

    // Fallback: search all player buses (handles region moved to a different track)
    for (const bus of this.trackAudioPlayerBuses.values()) {
      const found = bus.getAudioBuffer(audioFileId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * Copy an audio buffer from one track's player bus to another.
   * Used when an audio region is moved between tracks.
   */
  public copyAudioBufferBetweenTracks(
    sourceTrackId: string,
    targetTrackId: string,
    audioFileId: string
  ): void {
    // Use the raw AudioBuffer approach: get from any bus, wrap in ToneAudioBuffer, load into target
    const rawBuffer = this.getAudioBuffer(sourceTrackId, audioFileId);
    if (!rawBuffer) return;

    const targetBus = this.trackAudioPlayerBuses.get(targetTrackId);
    if (!targetBus) return;

    if (!targetBus.hasBuffer(audioFileId)) {
      const newToneBuffer = new Tone.ToneAudioBuffer(rawBuffer);
      targetBus.loadBuffer(audioFileId, newToneBuffer);

      // Remove the buffer from the source bus to free memory
      const sBus = this.trackAudioPlayerBuses.get(sourceTrackId);
      if (sBus && sBus !== targetBus) {
        sBus.removeBuffer(audioFileId);
      }

      console.log(`Moved audio buffer ${audioFileId} from track ${sourceTrackId} to track ${targetTrackId}`);
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
    this.clearDelayedTransportStart();

    console.log("Preparing playback");

    // Get playback delay from ConfigManager
    const configManager = ConfigManager.instance();
    const playbackDelay = (configManager.get('audio.playback_delay') as number) ?? 0.2;

    try {
      // Set project BPM and time signature FIRST (this affects timing calculations)
      Tone.Transport.bpm.value = project.getBpm();
      const timeSignature = project.getTimeSignature();
      const secondsPerBeat = 60 / project.getBpm();
      const resumeSafetyOffsetBeats =
        KGAudioInterface.AUDIO_RESUME_SAFETY_OFFSET_SECONDS / secondsPerBeat;
      Tone.Transport.timeSignature = [timeSignature.numerator, timeSignature.denominator];

      console.log(`Setting Tone.js BPM to ${project.getBpm()}, actual value: ${Tone.Transport.bpm.value}`);

      // Configure loop settings
      const isLooping = project.getIsLooping();
      let scheduleStartBeat = 0;
      let scheduleEndBeat = Infinity;

      if (isLooping) {
        const [startBar, endBarOriginal] = project.getLoopingRange();
        const beatsPerBar = timeSignature.numerator;

        // Handle [0, 0] case - use full project
        const endBar = (startBar === 0 && endBarOriginal === 0) ? project.getMaxBars() : endBarOriginal;

        scheduleStartBeat = startBar * beatsPerBar;
        scheduleEndBeat = (endBar + 1) * beatsPerBar; // +1 because endBar is inclusive

        // Configure Tone.Transport loop boundaries
        const loopStartTime = this.beatsToToneTime(scheduleStartBeat);
        const loopEndTime = this.beatsToToneTime(scheduleEndBeat);
        Tone.Transport.setLoopPoints(loopStartTime, loopEndTime);
        Tone.Transport.loop = true;

        console.log(`Loop mode enabled: bars [${startBar}, ${endBar}], beats [${scheduleStartBeat}, ${scheduleEndBeat}]`);

        // Adjust start position to loop start if before loop range
        if (startPosition < scheduleStartBeat) {
          startPosition = scheduleStartBeat;
        }
      } else {
        Tone.Transport.loop = false;
        console.log("Loop mode disabled");
      }

      if (startPosition < 0) {
        this.delayedTransportStartMs = Math.abs(startPosition) * secondsPerBeat * 1000;
        this.virtualPrerollStartBeat = startPosition;
        this.virtualPrerollStartTimeMs = null;
      } else {
        this.delayedTransportStartMs = 0;
        this.virtualPrerollStartBeat = null;
        this.virtualPrerollStartTimeMs = null;
      }

      // Set transport position (convert beats to Tone.js format)
      this.setTransportPosition(Math.max(0, startPosition));

      // Start metronome if enabled
      if (this.isMetronomeEnabled) {
        this.metronome.start(startPosition, timeSignature.numerator, playbackDelay);
      }

      // Schedule all MIDI events
      project.getTracks().forEach(track => {
        const trackId = track.getId().toString();
        const audioBus = this.trackAudioBuses.get(trackId);

        console.log(`Track ${trackId} has audio bus: ${audioBus ? 'true' : 'false'}; type: ${track.getType()}`);
        
        // Schedule MIDI track events
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
                  const noteEndBeat = note.getEndBeat() + regionStartBeat;
                  const noteDurationBeats = note.getEndBeat() - note.getStartBeat();

                  // Skip notes outside loop range when looping
                  if (noteStartBeat >= scheduleEndBeat || noteEndBeat <= scheduleStartBeat) {
                    return; // Skip notes outside the loop range
                  }

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
                    `Scheduling note ${noteName} at beat ${Number(noteStartBeat.toFixed ? noteStartBeat.toFixed(3) : noteStartBeat.toLocaleString(undefined, {maximumFractionDigits: 3}))}, Tone time: ${Number(Number(noteStartTime).toFixed(3))}, duration: ${Number(Number(noteDuration).toFixed(3))}, delay: ${playbackDelay}s`
                  );

                  // Schedule the note with delay offset
                  const eventId = Tone.Transport.schedule((time) => {
                    // Check if track should play considering solo logic
                    const hasSoloedTracks = this.hasSoloedTracks();
                    if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                      audioBus.triggerAttackRelease(noteName, noteDuration, time + playbackDelay, velocity);
                    }
                  }, noteStartTime);

                  this.scheduledEvents.add(eventId);
                });
              }
            }
          });
        }

        // Schedule audio/wav track events
        const playerBus = this.trackAudioPlayerBuses.get(trackId);
        if (playerBus && track.getType() === 'Wave') {
          track.getRegions().forEach(region => {
            if (region.getCurrentType() === 'KGAudioRegion') {
              const audioRegion = region as unknown as KGAudioRegion;
              const regionStartBeat = region.getStartFromBeat();
              const regionEndBeat = regionStartBeat + region.getLength();

              // Skip regions outside loop range when looping
              if (regionStartBeat >= scheduleEndBeat || regionEndBeat <= scheduleStartBeat) {
                return;
              }

              // Clip offset: where playback starts within the audio file
              const clipStartOffsetSeconds = audioRegion.getClipStartOffsetSeconds();
              const audioDurationSeconds = audioRegion.getAudioDurationSeconds();

              // Skip regions that start before playback start position
              if (regionStartBeat < startPosition) {
                // Region starts before playhead — calculate offset into the audio file
                const offsetBeats = startPosition - regionStartBeat;
                const offsetSeconds = offsetBeats * secondsPerBeat;
                const remainingBeats = regionEndBeat - startPosition;
                const remainingSeconds = remainingBeats * secondsPerBeat;
                const audioFileId = audioRegion.getAudioFileId();

                // Cap duration at loop boundary to prevent overlap on loop re-trigger
                let effectiveRemainingSeconds = remainingSeconds;
                if (isLooping) {
                  const maxDurationBeats = scheduleEndBeat - startPosition;
                  const maxDurationSeconds = maxDurationBeats * secondsPerBeat;
                  effectiveRemainingSeconds = Math.min(remainingSeconds, maxDurationSeconds);
                }

                // Cap at available audio after clip offset
                effectiveRemainingSeconds = Math.min(
                  effectiveRemainingSeconds,
                  audioDurationSeconds - clipStartOffsetSeconds - offsetSeconds
                );

                if (effectiveRemainingSeconds > 0 && playerBus.hasBuffer(audioFileId)) {
                  // Resume slightly after the current transport boundary and
                  // compensate the source offset/duration. Scheduling exactly
                  // at the playhead here can intermittently miss the callback,
                  // which leaves the playhead moving but the clip silent.
                  const safeResumeBeat = Math.min(
                    startPosition + resumeSafetyOffsetBeats,
                    regionEndBeat
                  );
                  const extraOffsetSeconds = (safeResumeBeat - startPosition) * secondsPerBeat;
                  const adjustedOffsetSeconds = clipStartOffsetSeconds + offsetSeconds + extraOffsetSeconds;
                  const adjustedRemainingSeconds = Math.max(
                    0,
                    effectiveRemainingSeconds - extraOffsetSeconds
                  );

                  if (adjustedRemainingSeconds <= 0) {
                    return;
                  }

                  const regionStartTime = this.beatsToToneTime(safeResumeBeat);

                  const eventId = Tone.Transport.schedule((time) => {
                    const hasSoloedTracks = this.hasSoloedTracks();
                    if (playerBus.shouldPlayWithSolo(hasSoloedTracks)) {
                      playerBus.schedulePlayback(
                        time + playbackDelay,
                        audioFileId,
                        adjustedOffsetSeconds,
                        adjustedRemainingSeconds
                      );
                    }
                  }, regionStartTime);
                  this.scheduledEvents.add(eventId);
                }
                return;
              }

              const audioFileId = audioRegion.getAudioFileId();
              // Effective duration: region length in seconds, capped at available audio after clip offset
              const regionLengthSeconds = region.getLength() * secondsPerBeat;
              let effectiveDurationSeconds = Math.min(
                regionLengthSeconds,
                audioDurationSeconds - clipStartOffsetSeconds
              );

              if (!playerBus.hasBuffer(audioFileId)) {
                console.warn(`No audio buffer loaded for ${audioFileId}`);
                return;
              }

              // Cap duration at loop boundary to prevent overlap on loop re-trigger
              if (isLooping) {
                const maxDurationBeats = scheduleEndBeat - regionStartBeat;
                const maxDurationSeconds = maxDurationBeats * secondsPerBeat;
                effectiveDurationSeconds = Math.min(effectiveDurationSeconds, maxDurationSeconds);
              }

              const regionStartTime = this.beatsToToneTime(regionStartBeat);

              console.log(
                `Scheduling audio region "${region.getName()}" at beat ${regionStartBeat}, clipOffset: ${clipStartOffsetSeconds}s, duration: ${effectiveDurationSeconds}s`
              );

              const eventId = Tone.Transport.schedule((time) => {
                const hasSoloedTracks = this.hasSoloedTracks();
                if (playerBus.shouldPlayWithSolo(hasSoloedTracks)) {
                  playerBus.schedulePlayback(time + playbackDelay, audioFileId, clipStartOffsetSeconds, effectiveDurationSeconds);
                }
              }, regionStartTime);

              this.scheduledEvents.add(eventId);
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

      if (this.delayedTransportStartMs > 0 && this.virtualPrerollStartBeat !== null) {
        this.virtualPrerollStartTimeMs = performance.now();
        this.delayedTransportStartTimeoutId = window.setTimeout(() => {
          this.delayedTransportStartTimeoutId = null;
          this.virtualPrerollStartBeat = null;
          this.virtualPrerollStartTimeMs = null;
          Tone.Transport.start();
        }, this.delayedTransportStartMs);
      } else {
        Tone.Transport.start();
      }

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
      this.clearDelayedTransportStart();
      Tone.Transport.stop();
      this.metronome.stop();

      // Release all currently playing notes
      this.trackAudioBuses.forEach(audioBus => {
        audioBus.releaseAll();
      });

      // Stop all audio player buses
      this.trackAudioPlayerBuses.forEach(playerBus => {
        playerBus.stopAll();
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
      const safePosition = Math.max(0, position);
      const toneTime = this.beatsToToneTime(safePosition);
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
      if (this.virtualPrerollStartBeat !== null && this.virtualPrerollStartTimeMs !== null) {
        const project = KGCore.instance().getCurrentProject();
        const secondsPerBeat = 60 / project.getBpm();
        const elapsedSeconds = (performance.now() - this.virtualPrerollStartTimeMs) / 1000;
        const elapsedBeats = elapsedSeconds / secondsPerBeat;
        return Math.min(0, this.virtualPrerollStartBeat + elapsedBeats);
      }

      const position = Tone.Transport.position;
      return this.toneTimeToBeats(position);
    } catch (error) {
      console.error('Error getting transport position:', error);
      return 0;
    }
  }

  // ===== METRONOME =====

  public setMetronomeEnabled(enabled: boolean): void {
    this.isMetronomeEnabled = enabled;
  }

  /** Start the metronome mid-playback without restarting the transport. */
  public startMetronomeDuringPlayback(currentPositionBeats: number, beatsPerBar: number): void {
    const playbackDelay = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
    this.metronome.start(currentPositionBeats, beatsPerBar, playbackDelay);
  }

  /** Stop the metronome mid-playback without stopping the transport. */
  public stopMetronomeDuringPlayback(): void {
    this.metronome.stop();
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
      const playerBus = this.trackAudioPlayerBuses.get(trackId);
      if (audioBus) {
        audioBus.setVolume(volume);
      }
      if (playerBus) {
        playerBus.setVolume(volume);
      }
      if (!audioBus && !playerBus) {
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
      const playerBus = this.trackAudioPlayerBuses.get(trackId);
      if (audioBus) {
        audioBus.setMuted(muted);
      }
      if (playerBus) {
        playerBus.setMuted(muted);
      }
      if (!audioBus && !playerBus) {
        console.warn(`No audio bus found for track ${trackId}`);
      }
      // Recompute effective volumes across all buses (solo logic)
      this.updateAllEffectiveVolumes();
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
      const playerBus = this.trackAudioPlayerBuses.get(trackId);
      if (audioBus) {
        audioBus.setSolo(solo);
      }
      if (playerBus) {
        playerBus.setSolo(solo);
      }
      if (!audioBus && !playerBus) {
        console.warn(`No audio bus found for track ${trackId}`);
      }
      // Recompute effective volumes across all buses (solo logic)
      this.updateAllEffectiveVolumes();
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
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    return audioBus?.getVolume() ?? playerBus?.getVolume() ?? AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
  }

  public getTrackMuted(trackId: string): boolean {
    const audioBus = this.trackAudioBuses.get(trackId);
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    return audioBus?.getMuted() ?? playerBus?.getMuted() ?? false;
  }

  public getTrackSolo(trackId: string): boolean {
    const audioBus = this.trackAudioBuses.get(trackId);
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    return audioBus?.getSolo() ?? playerBus?.getSolo() ?? false;
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

  private clearDelayedTransportStart(): void {
    if (this.delayedTransportStartTimeoutId !== null) {
      window.clearTimeout(this.delayedTransportStartTimeoutId);
      this.delayedTransportStartTimeoutId = null;
    }

    this.delayedTransportStartMs = 0;
    this.virtualPrerollStartBeat = null;
    this.virtualPrerollStartTimeMs = null;
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
    return Array.from(this.trackAudioBuses.values()).some(bus => bus.getSolo()) ||
           Array.from(this.trackAudioPlayerBuses.values()).some(bus => bus.getSolo());
  }

  /**
   * Update effective volume for all tracks according to mute/solo state
   */
  private updateAllEffectiveVolumes(): void {
    try {
      const hasSoloedTracks = this.hasSoloedTracks();
      this.trackAudioBuses.forEach(bus => bus.applyEffectiveVolume(hasSoloedTracks));
      this.trackAudioPlayerBuses.forEach(bus => bus.applyEffectiveVolume(hasSoloedTracks));
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

  /**
   * Set the audio lookahead time
   * Lower values reduce MIDI input latency but may cause audio glitches
   * @param seconds Lookahead time in seconds (e.g., 0.01 for 10ms, 0.1 for 100ms)
   */
  public setLookaheadTime(seconds: number): void {
    try {
      Tone.getContext().lookAhead = seconds;
      console.log(`Audio lookahead time set to: ${seconds}s (${seconds * 1000}ms)`);
    } catch (error) {
      console.error('Error setting lookahead time:', error);
    }
  }

  /**
   * Get the current audio lookahead time
   * @returns Lookahead time in seconds
   */
  public getLookaheadTime(): number {
    return Tone.getContext().lookAhead;
  }
}
