import type { KGProject } from '../KGProject';
import type { KGMidiNote } from '../midi/KGMidiNote';
import type { KGMidiPitchBend } from '../midi/KGMidiPitchBend';
import { TIME_CONSTANTS, AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { UserInstrumentRegistry } from '../instruments/UserInstrumentRegistry';
import {
  clampMidiControllerValue,
  MIDI_PITCH_BEND_CENTER,
  midiPitchBendToNormalized,
  pitchToNoteNameString,
} from '../../util/midiUtil';
import {
  bakeMidiAutomationPointsInWindow,
  collectRegionMidiAutomationPoints,
  normalizeMidiAutomationPoints,
  resolveMidiAutomationValueAtTick,
  resolveSustainExtendedEndTick,
} from '../../util/midiAutomationUtil';
import {
  bakeTrackAutomationPointsInWindow,
  getTrackAutomationDefaultValue,
  resolveTrackAutomationValueAtTick,
} from '../../util/trackAutomationUtil';
import * as Tone from 'tone';
import { KGAudioBus } from './KGAudioBus';
import { KGToneBuffersPool } from './KGToneBuffersPool';
import { KGAudioPlayerBus } from './KGAudioPlayerBus';
import {
  KGAudioRecorder,
  type AudioRecordingPeak,
  type AudioRecordingResult,
  type AudioRecordingStartResult,
} from './KGAudioRecorder';
import { KGMidiTrack, type InstrumentType } from '../track/KGMidiTrack';
import type { KGAudioRegion } from '../region/KGAudioRegion';
import { KGCore } from '../KGCore';
import { ConfigManager } from '../config/ConfigManager';
import { KGMetronome } from './KGMetronome';
import { GlobalTrackType } from '../global-track';
import { tickRangeToSeconds, tickToSeconds, findGlobalTrackByType, getEffectiveBpmAtTick, getSortedTempoRegions, secondsToTick } from '../../util/globalTrackUtil';
import { TICKS_PER_QUARTER, ticksPerBar, ticksPerMeterBeat } from '../timing';

interface PreparePlaybackOptions {
  allowStartBeforeLoopStart?: boolean;
  scheduleFullLoop?: boolean;
}

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
  private delayedTransportStartSeconds: number = 0;
  private virtualPrerollStartTick: number | null = null;
  private virtualPrerollStartAudioTime: number | null = null;
  private playbackOriginTick: number = 0;
  private playbackOriginSeconds: number = 0;

  // Master volume control
  private masterGain: Tone.Gain | null = null;

  // Metronome
  private metronome: KGMetronome = new KGMetronome();
  private isMetronomeEnabled = false;

  // Audio capture for screen sharing
  private captureDestination: MediaStreamAudioDestinationNode | null = null;
  private captureStream: MediaStream | null = null;

  // Microphone recorder
  private audioRecorder: KGAudioRecorder = new KGAudioRecorder();

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
      Tone.Transport.PPQ = TICKS_PER_QUARTER;
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

      await this.audioRecorder.cancel();
      
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
      // Initialize with track's stored mix state if available
      const project = KGCore.instance().getCurrentProject();
      const track = project.getTracks().find(t => t.getId().toString() === trackId);
      const initialVolume = track ? track.getVolume() : AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
      const initialMuted = track ? track.getMuted() : false;
      const initialSolo = track ? track.getSolo() : false;
      const audioBus = await KGAudioBus.create(instrumentType, initialVolume, 0, initialMuted, initialSolo);
      
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
      const project = KGCore.instance().getCurrentProject();
      const track = project.getTracks().find(t => t.getId().toString() === trackId);
      const initialMuted = track ? track.getMuted() : false;
      const initialSolo = track ? track.getSolo() : false;
      const playerBus = await KGAudioPlayerBus.create(volume, 0, initialMuted, initialSolo);

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
   * Check whether an audio track currently has a player bus.
   */
  public hasTrackAudioPlayerBus(trackId: string): boolean {
    return this.trackAudioPlayerBuses.has(trackId);
  }

  /**
   * Check whether an audio buffer is loaded on a specific track's player bus.
   */
  public hasAudioBufferForTrack(trackId: string, audioFileId: string): boolean {
    return this.trackAudioPlayerBuses.get(trackId)?.hasBuffer(audioFileId) ?? false;
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
  public preparePlayback(project: KGProject, startPosition: number, options?: PreparePlaybackOptions): void {
    // Clear any existing scheduled events
    this.clearScheduledEvents();
    this.clearDelayedTransportStart();
    this.trackAudioBuses.forEach(audioBus => audioBus.resetLiveMidiPitchBend());
    this.clearTrackAutomationOverrides();

    console.log("Preparing playback");

    // Get playback delay from ConfigManager
    const configManager = ConfigManager.instance();
    const playbackDelay = (configManager.get('audio.playback_delay') as number) ?? 0.2;

    try {
      // Set project BPM and time signature FIRST (this affects timing calculations)
      Tone.Transport.bpm.value = getEffectiveBpmAtTick(project, Math.max(startPosition, 0));
      const timeSignature = project.getTimeSignature();
      const secondsPerQuarter = 60 / Math.max(1, getEffectiveBpmAtTick(project, Math.max(startPosition, 0)));
      const resumeSafetyOffsetTicks = Math.max(1, Math.round(
        (KGAudioInterface.AUDIO_RESUME_SAFETY_OFFSET_SECONDS / secondsPerQuarter) * TICKS_PER_QUARTER
      ));
      Tone.Transport.timeSignature = [timeSignature.numerator, timeSignature.denominator];

      console.log(`Setting Tone.js BPM to ${Tone.Transport.bpm.value}, actual value: ${Tone.Transport.bpm.value}`);

      // Configure loop settings
      const isLooping = project.getIsLooping();
      let scheduleStartTick = 0;
      let scheduleEndTick = Infinity;

      if (isLooping) {
        const [startBar, endBarOriginal] = project.getLoopingRange();
        const projectTicksPerBar = ticksPerBar(timeSignature);

        // Handle [0, 0] case - use full project
        const endBar = (startBar === 0 && endBarOriginal === 0) ? project.getMaxBars() : endBarOriginal;

        scheduleStartTick = startBar * projectTicksPerBar;
        scheduleEndTick = (endBar + 1) * projectTicksPerBar; // +1 because endBar is inclusive

        // Adjust start position to loop start if before loop range
        if (startPosition < scheduleStartTick && !options?.allowStartBeforeLoopStart) {
          startPosition = scheduleStartTick;
        }

        this.setPlaybackOrigin(project, startPosition >= scheduleStartTick ? scheduleStartTick : startPosition);

        // Configure Tone.Transport loop boundaries
        const loopStartTime = this.projectTickToTransportTime(scheduleStartTick);
        const loopEndTime = this.projectTickToTransportTime(scheduleEndTick);
        Tone.Transport.setLoopPoints(loopStartTime, loopEndTime);
        Tone.Transport.loop = true;

        console.log(`Loop mode enabled: bars [${startBar}, ${endBar}], beats [${scheduleStartTick}, ${scheduleEndTick}]`);
      } else {
        Tone.Transport.loop = false;
        console.log("Loop mode disabled");
        this.setPlaybackOrigin(project, startPosition);
      }

      const playbackWindowStartTick = isLooping && options?.scheduleFullLoop
        ? scheduleStartTick
        : Math.max(startPosition, scheduleStartTick);

      if (isLooping && options?.scheduleFullLoop) {
        const eventId = Tone.Transport.schedule(() => {
          Tone.Transport.bpm.value = getEffectiveBpmAtTick(project, scheduleStartTick);
        }, this.projectTickToTransportTime(scheduleStartTick));
        this.scheduledEvents.add(eventId);
      }
      this.scheduleTempoChanges(project, playbackWindowStartTick, scheduleEndTick);

      if (startPosition < 0) {
        this.delayedTransportStartSeconds = (Math.abs(startPosition) / TICKS_PER_QUARTER) * (60 / project.getBpm());
        this.virtualPrerollStartTick = startPosition;
        this.virtualPrerollStartAudioTime = null;
      } else {
        this.delayedTransportStartSeconds = 0;
        this.virtualPrerollStartTick = null;
        this.virtualPrerollStartAudioTime = null;
      }

      // Set transport position (convert beats to Tone.js format)
      this.setTransportPosition(Math.max(0, startPosition));

      // Start metronome if enabled
      if (this.isMetronomeEnabled) {
        this.metronome.start(startPosition, ticksPerBar(timeSignature), ticksPerMeterBeat(timeSignature), playbackDelay);
      }

      // Schedule all MIDI events
      project.getTracks().forEach(track => {
        const trackId = track.getId().toString();
        const audioBus = this.trackAudioBuses.get(trackId);
        const playerBus = this.trackAudioPlayerBuses.get(trackId);
        const interpolationIntervalMs = (configManager.get('audio.midi_automation_interpolation_interval_ms') as number) ?? 10;
        const initialAutomationTick = isLooping ? Math.max(startPosition, scheduleStartTick) : startPosition;
        const automationWindowStartTick = isLooping && options?.scheduleFullLoop
          ? scheduleStartTick
          : initialAutomationTick;

        this.applyTrackAutomationAtBeat(track, initialAutomationTick);
        this.scheduleTrackAutomation(
          track,
          automationWindowStartTick,
          scheduleEndTick,
          interpolationIntervalMs,
          getEffectiveBpmAtTick(project, automationWindowStartTick),
          isLooping && options?.scheduleFullLoop
        );

        console.log(`Track ${trackId} has audio bus: ${audioBus ? 'true' : 'false'}; type: ${track.getType()}`);
        
        // Schedule MIDI track events
        if (audioBus && track.getType() === 'MIDI') {
          const trackNotes: Array<{ note: KGMidiNote; absoluteStartTick: number; absoluteEndTick: number }> = [];
          const trackPitchBends = collectRegionMidiAutomationPoints(
            track.getRegions()
              .filter(region => region.getCurrentType() === 'KGMidiRegion')
              .map(region => {
                const midiRegion = region as unknown as { getPitchBends: () => KGMidiPitchBend[] };
                return {
                  startTick: region.getStartTick(),
                  points: midiRegion.getPitchBends().map(pitchBend => ({
                    tick: pitchBend.getTick(),
                    value: pitchBend.getValue(),
                  })),
                };
              })
          );
          const trackControllerEvents = Array.from({ length: 128 }, (_, controller) => (
            collectRegionMidiAutomationPoints(
              track.getRegions()
                .filter(region => region.getCurrentType() === 'KGMidiRegion')
                .map(region => {
                  const midiRegion = region as unknown as { getControllerEvents: (controller: number) => Array<{ getTick: () => number; getValue: () => number }> };
                  return {
                    startTick: region.getStartTick(),
                    points: midiRegion.getControllerEvents(controller).map(event => ({
                      tick: event.getTick(),
                      value: event.getValue(),
                    })),
                  };
              })
            )
          ));
          const expressionControllers = [1, 2, 7, 11];
          const mergedExpressionEvents = normalizeMidiAutomationPoints(
            expressionControllers.flatMap(controller => trackControllerEvents[controller])
          );

          track.getRegions().forEach(region => {
            console.log(`Region ${region.getId().toString()}: type: ${region.getCurrentType()}`);

            if (region.getCurrentType() === 'KGMidiRegion') {
              const midiRegion = region as unknown as { getNotes: () => KGMidiNote[] };
              const regionStartTick = region.getStartTick();

              // Get notes from region (assuming it has a getNotes method)
              if (midiRegion.getNotes) {
                midiRegion.getNotes().forEach((note: KGMidiNote) => {
                  // Calculate absolute note timing in beats (note position + region start position)
                  const noteStartTick = note.getStartTick() + regionStartTick;
                  const noteEndTick = note.getEndTick() + regionStartTick;
                  const sustainedEndTick = resolveSustainExtendedEndTick(
                    trackControllerEvents[64],
                    noteEndTick,
                    0
                  );

                  // Skip notes outside loop range when looping
                  if (noteStartTick >= scheduleEndTick || sustainedEndTick <= scheduleStartTick) {
                    return; // Skip notes outside the loop range
                  }

                  // In a full-loop schedule, retain earlier notes for future wraps.
                  if (noteStartTick < playbackWindowStartTick) {
                    return; // Skip notes that would have already finished before playback starts
                  }
                  trackNotes.push({
                    note,
                    absoluteStartTick: noteStartTick,
                    absoluteEndTick: sustainedEndTick,
                  });
                });
              }
            }
          });

          const initialPitchBendTick = isLooping ? Math.max(startPosition, scheduleStartTick) : startPosition;
          const initialPitchBendValue = resolveMidiAutomationValueAtTick(
            trackPitchBends,
            initialPitchBendTick,
            MIDI_PITCH_BEND_CENTER
          );
          audioBus.setLiveMidiPitchBend(midiPitchBendToNormalized(initialPitchBendValue));
          const expressionInitialValue = resolveMidiAutomationValueAtTick(
            mergedExpressionEvents,
            initialPitchBendTick,
            127,
            'linear'
          );
          audioBus.setLiveMidiExpression(clampMidiControllerValue(expressionInitialValue) / 127);
          const sustainInitialValue = resolveMidiAutomationValueAtTick(
            trackControllerEvents[64],
            initialPitchBendTick,
            0,
            'step'
          );
          audioBus.setLiveMidiSustain(sustainInitialValue >= 64);

          const pitchBendWindowStartTick = isLooping ? scheduleStartTick : Math.max(startPosition, 0);
          const bakedTrackPitchBends = bakeMidiAutomationPointsInWindow(
            trackPitchBends,
            pitchBendWindowStartTick,
            scheduleEndTick,
            {
              maxIntervalMs: interpolationIntervalMs,
              bpm: getEffectiveBpmAtTick(project, pitchBendWindowStartTick),
              defaultValue: MIDI_PITCH_BEND_CENTER,
            }
          );

          bakedTrackPitchBends.forEach(({ tick, value }) => {
            if (!isLooping && tick <= pitchBendWindowStartTick) {
              return;
            }

            const eventId = Tone.Transport.schedule((time) => {
              const hasSoloedTracks = this.hasSoloedTracks();
              if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                audioBus.scheduleLiveMidiPitchBend(midiPitchBendToNormalized(value), time);
              }
            }, this.projectTickToTransportTime(tick));

            this.scheduledEvents.add(eventId);
          });

          const bakedExpressionEvents = bakeMidiAutomationPointsInWindow(
            mergedExpressionEvents,
            pitchBendWindowStartTick,
            scheduleEndTick,
            {
              maxIntervalMs: interpolationIntervalMs,
              bpm: getEffectiveBpmAtTick(project, pitchBendWindowStartTick),
              defaultValue: 127,
              interpolationMode: 'linear',
              quantizeValue: clampMidiControllerValue,
            }
          );

          bakedExpressionEvents.forEach(({ tick, value }) => {
            if (!isLooping && tick <= pitchBendWindowStartTick) {
              return;
            }

            const eventId = Tone.Transport.schedule((time) => {
              const hasSoloedTracks = this.hasSoloedTracks();
              if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                audioBus.scheduleLiveMidiExpression(value / 127, time);
              }
            }, this.projectTickToTransportTime(tick));

            this.scheduledEvents.add(eventId);
          });

          const bakedSustainEvents = bakeMidiAutomationPointsInWindow(
            trackControllerEvents[64],
            pitchBendWindowStartTick,
            scheduleEndTick,
            {
              maxIntervalMs: interpolationIntervalMs,
              bpm: getEffectiveBpmAtTick(project, pitchBendWindowStartTick),
              defaultValue: 0,
              interpolationMode: 'step',
              quantizeValue: clampMidiControllerValue,
            }
          );

          bakedSustainEvents.forEach(({ tick, value }) => {
            if (!isLooping && tick <= pitchBendWindowStartTick) {
              return;
            }

            const eventId = Tone.Transport.schedule((time) => {
              const hasSoloedTracks = this.hasSoloedTracks();
              if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                audioBus.setLiveMidiSustain(value >= 64, time);
              }
            }, this.projectTickToTransportTime(tick));

            this.scheduledEvents.add(eventId);
          });

          trackNotes.forEach(({ note, absoluteStartTick, absoluteEndTick }) => {
            const noteStartTime = this.projectTickToTransportTime(absoluteStartTick);
            const noteDurationSeconds = tickRangeToSeconds(project, absoluteStartTick, absoluteEndTick);
            const velocity = note.getVelocity() / 127;
            const noteName = pitchToNoteNameString(note.getPitch());

            console.log(
              `Scheduling note ${noteName} at tick ${Number(absoluteStartTick.toFixed ? absoluteStartTick.toFixed(3) : absoluteStartTick.toLocaleString(undefined, {maximumFractionDigits: 3}))}, Tone time: ${Number(Number(noteStartTime).toFixed(3))}, duration: ${Number(Number(noteDurationSeconds).toFixed(3))}, delay: ${playbackDelay}s`
            );

            const eventId = Tone.Transport.schedule((time) => {
              const hasSoloedTracks = this.hasSoloedTracks();
              if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
                audioBus.triggerPitchBendAwareAttack(note.getPitch(), time + playbackDelay, velocity, noteDurationSeconds, hasSoloedTracks);
              }
            }, noteStartTime);

            this.scheduledEvents.add(eventId);
          });
        }

        // Schedule audio/wav track events
        if (playerBus && track.getType() === 'Wave') {
          track.getRegions().forEach(region => {
            if (region.getCurrentType() === 'KGAudioRegion') {
              const audioRegion = region as unknown as KGAudioRegion;
              const regionStartTick = region.getStartTick();
              const regionEndTick = regionStartTick + region.getLengthTicks();

              // Skip regions outside loop range when looping
              if (regionStartTick >= scheduleEndTick || regionEndTick <= scheduleStartTick) {
                return;
              }

              // Clip offset: where playback starts within the audio file
              const clipStartOffsetSeconds = audioRegion.getClipStartOffsetSeconds();
              const audioDurationSeconds = audioRegion.getAudioDurationSeconds();
              const audioFileId = audioRegion.getAudioFileId();

              const scheduleRegionResume = (
                resumeTick: number,
                maximumEndTick: number,
                once: boolean
              ): void => {
                const offsetSeconds = tickRangeToSeconds(project, regionStartTick, resumeTick);
                const remainingSeconds = tickRangeToSeconds(project, resumeTick, regionEndTick);
                const maximumDurationSeconds = tickRangeToSeconds(project, resumeTick, maximumEndTick);
                const availableAudioSeconds = audioDurationSeconds - clipStartOffsetSeconds - offsetSeconds;
                const effectiveRemainingSeconds = Math.min(
                  remainingSeconds,
                  maximumDurationSeconds,
                  availableAudioSeconds
                );

                if (effectiveRemainingSeconds <= 0 || !playerBus.hasBuffer(audioFileId)) {
                  return;
                }

                // Resume just after the transport boundary so Tone cannot miss
                // the event, compensating both source offset and duration.
                const safeResumeTick = Math.min(
                  resumeTick + resumeSafetyOffsetTicks,
                  regionEndTick,
                  maximumEndTick
                );
                const extraOffsetSeconds = tickRangeToSeconds(project, resumeTick, safeResumeTick);
                const adjustedRemainingSeconds = Math.max(0, effectiveRemainingSeconds - extraOffsetSeconds);
                if (adjustedRemainingSeconds <= 0) {
                  return;
                }

                const scheduleResume = once
                  ? Tone.Transport.scheduleOnce.bind(Tone.Transport)
                  : Tone.Transport.schedule.bind(Tone.Transport);
                const eventId = scheduleResume((time) => {
                  // Start the source even when the track is currently muted or
                  // excluded by solo. The player bus gain controls audibility.
                  playerBus.schedulePlayback(
                    time + playbackDelay,
                    audioFileId,
                    clipStartOffsetSeconds + offsetSeconds + extraOffsetSeconds,
                    adjustedRemainingSeconds
                  );
                }, this.projectTickToTransportTime(safeResumeTick));
                this.scheduledEvents.add(eventId);
              };

              // Skip regions that start before playback start position
              if (regionStartTick < startPosition) {
                const isFullLoopSeek = isLooping && options?.scheduleFullLoop;
                if (!isFullLoopSeek || startPosition > scheduleStartTick) {
                  scheduleRegionResume(startPosition, isLooping ? scheduleEndTick : regionEndTick, Boolean(isFullLoopSeek));
                }
                if (!(isLooping && options?.scheduleFullLoop)) {
                  return;
                }

                if (regionStartTick < scheduleStartTick) {
                  // The source begins before the loop. Re-enter it from the
                  // loop-start offset on every wrap instead of scheduling its
                  // out-of-loop project start at transport time zero.
                  scheduleRegionResume(scheduleStartTick, scheduleEndTick, false);
                  return;
                }
              }

              // Effective duration: region length in seconds, capped at available audio after clip offset
              const regionLengthSeconds = tickRangeToSeconds(project, regionStartTick, regionEndTick);
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
                const maxDurationTicks = scheduleEndTick - regionStartTick;
                const maxDurationSeconds = tickRangeToSeconds(project, regionStartTick, regionStartTick + maxDurationTicks);
                effectiveDurationSeconds = Math.min(effectiveDurationSeconds, maxDurationSeconds);
              }

              const regionStartTime = this.projectTickToTransportTime(regionStartTick);

              console.log(
                `Scheduling audio region "${region.getName()}" at tick ${regionStartTick}, clipOffset: ${clipStartOffsetSeconds}s, duration: ${effectiveDurationSeconds}s`
              );

              const eventId = Tone.Transport.schedule((time) => {
                // See the resume path above: sources must exist while muted so
                // transport-time mute and solo changes take effect immediately.
                playerBus.schedulePlayback(time + playbackDelay, audioFileId, clipStartOffsetSeconds, effectiveDurationSeconds);
              }, regionStartTime);

              this.scheduledEvents.add(eventId);
            }
          });
        }
      });
      
      console.log(`Prepared playback from position ${startPosition} with ${this.scheduledEvents.size} events`);
    } catch (error) {
      console.error('Error preparing playback:', error);
      throw error;
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

      if (this.delayedTransportStartSeconds > 0 && this.virtualPrerollStartTick !== null) {
        this.virtualPrerollStartAudioTime = Tone.now();
        this.delayedTransportStartTimeoutId = Tone.getContext().setTimeout(() => {
          this.delayedTransportStartTimeoutId = null;
          this.virtualPrerollStartTick = null;
          this.virtualPrerollStartAudioTime = null;
          Tone.Transport.start();
        }, this.delayedTransportStartSeconds);
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
      this.resetPlaybackOrigin();
      this.metronome.stop();

      // Release all currently playing notes
      this.trackAudioBuses.forEach(audioBus => {
        audioBus.releaseAll();
      });

      // Stop all audio player buses
      this.trackAudioPlayerBuses.forEach(playerBus => {
        playerBus.stopAll();
      });
      this.clearTrackAutomationOverrides();

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
      
      // Preview duration follows the project tempo map at the current playhead.
      const durationTicks = note.getEndTick() - note.getStartTick();
      const project = KGCore.instance().getCurrentProject();
      const previewStartTick = Math.max(0, this.getTransportPosition());
      const duration = tickRangeToSeconds(project, previewStartTick, previewStartTick + durationTicks) as Tone.Unit.Time;
      const triggerTime = time ?? Tone.now();
      this.applyTrackAutomationForCurrentBeat(trackId);
      
      // Check if track should play considering solo logic
      const hasSoloedTracks = this.hasSoloedTracks();
      if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
        audioBus.triggerAttackRelease(noteName, duration, triggerTime, velocity, hasSoloedTracks);
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
      this.applyTrackAutomationForCurrentBeat(trackId);

      // Check if track should play considering solo logic
      const hasSoloedTracks = this.hasSoloedTracks();
      if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
        audioBus.triggerAttack(noteName, triggerTime, normalizedVelocity, hasSoloedTracks);
        console.log(`Triggered attack for note ${noteName} (pitch ${pitch}) on track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error triggering note attack for track ${trackId}:`, error);
    }
  }

  /**
   * Trigger note attack for live MIDI keyboard monitoring.
   * Unlike piano-roll audition, this path tracks active sources so pitch bend can retune them.
   */
  public triggerLiveMidiNoteAttack(trackId: string, pitch: number, velocity: number = 127, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      const normalizedVelocity = velocity / 127;
      const triggerTime = time ?? Tone.now();
      this.applyTrackAutomationForCurrentBeat(trackId);

      const hasSoloedTracks = this.hasSoloedTracks();
      if (audioBus.shouldPlayWithSolo(hasSoloedTracks)) {
        audioBus.triggerLiveMidiAttack(pitch, triggerTime, normalizedVelocity, hasSoloedTracks);
        console.log(`Triggered live MIDI attack for pitch ${pitch} on track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error triggering live MIDI note attack for track ${trackId}:`, error);
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

  public releaseLiveMidiNote(trackId: string, pitch: number, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      const releaseTime = time ?? Tone.now();
      audioBus.releaseLiveMidiNote(pitch, releaseTime);
      console.log(`Released live MIDI note ${pitch} on track ${trackId}`);
    } catch (error) {
      console.error(`Error releasing live MIDI note for track ${trackId}:`, error);
    }
  }

  public setLiveMidiPitchBend(trackId: string, normalizedBend: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      audioBus.setLiveMidiPitchBend(normalizedBend);
      console.log(`Set live MIDI pitch bend to ${normalizedBend} on track ${trackId}`);
    } catch (error) {
      console.error(`Error setting live MIDI pitch bend for track ${trackId}:`, error);
    }
  }

  public setLiveMidiExpression(trackId: string, normalizedValue: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      audioBus.setLiveMidiExpression(normalizedValue);
      console.log(`Set live MIDI expression to ${normalizedValue} on track ${trackId}`);
    } catch (error) {
      console.error(`Error setting live MIDI expression for track ${trackId}:`, error);
    }
  }

  public scheduleLiveMidiExpression(trackId: string, normalizedValue: number, time: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      audioBus.scheduleLiveMidiExpression(normalizedValue, time);
      console.log(`Scheduled live MIDI expression to ${normalizedValue} on track ${trackId}`);
    } catch (error) {
      console.error(`Error scheduling live MIDI expression for track ${trackId}:`, error);
    }
  }

  public setLiveMidiSustain(trackId: string, isDown: boolean, time?: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      if (!audioBus) {
        console.warn(`No audio bus found for track ${trackId}`);
        return;
      }

      audioBus.setLiveMidiSustain(isDown, time);
      console.log(`Set live MIDI sustain to ${isDown} on track ${trackId}`);
    } catch (error) {
      console.error(`Error setting live MIDI sustain for track ${trackId}:`, error);
    }
  }

  public async startAudioRecording(
    inputDeviceId: string = 'default',
    onPeaks?: (peaks: AudioRecordingPeak[]) => void
  ): Promise<AudioRecordingStartResult> {
    return await this.audioRecorder.start(inputDeviceId, onPeaks);
  }

  public async stopAudioRecording(): Promise<AudioRecordingResult | null> {
    return await this.audioRecorder.stop();
  }

  public async cancelAudioRecording(): Promise<void> {
    await this.audioRecorder.cancel();
  }

  public async applyConfiguredOutputDevice(outputDeviceId: string): Promise<boolean> {
    if (outputDeviceId === 'default') {
      return false;
    }

    const rawContext = Tone.getContext().rawContext as AudioContext & {
      setSinkId?: (sinkId: string) => Promise<void>;
      sinkId?: string;
    };

    if (typeof rawContext.setSinkId !== 'function') {
      return false;
    }

    try {
      await rawContext.setSinkId(outputDeviceId);
      console.log(`Applied audio output device ${outputDeviceId}`);
      return true;
    } catch (error) {
      console.warn(`Unable to apply audio output device ${outputDeviceId}:`, error);
      return false;
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
      const safePosition = Math.max(0, position);
      const toneTime = this.projectTickToTransportTime(safePosition);
      Tone.Transport.position = toneTime;
      console.log(`Set transport position to ${position} ticks (${toneTime})`);
    } catch (error) {
      console.error('Error setting transport position:', error);
    }
  }

  /**
   * Get current transport position
   */
  public getTransportPosition(): number {
    try {
      if (this.virtualPrerollStartTick !== null && this.virtualPrerollStartAudioTime !== null) {
        const project = KGCore.instance().getCurrentProject();
        const secondsPerQuarter = 60 / project.getBpm();
        const elapsedSeconds = Math.max(0, Tone.now() - this.virtualPrerollStartAudioTime);
        const elapsedTicks = (elapsedSeconds / secondsPerQuarter) * TICKS_PER_QUARTER;
        return Math.min(0, this.virtualPrerollStartTick + elapsedTicks);
      }

      const transportSeconds = Number(Tone.Transport.seconds);
      if (Number.isFinite(transportSeconds)) {
        return secondsToTick(
          KGCore.instance().getCurrentProject(),
          this.playbackOriginSeconds + Math.max(0, transportSeconds)
        );
      }

      return this.transportTimeToProjectTick(KGCore.instance().getCurrentProject(), Tone.Transport.position);
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
  public startMetronomeDuringPlayback(currentPositionTicks: number, barTicks: number, meterBeatTicks: number): void {
    const playbackDelay = (ConfigManager.instance().get('audio.playback_delay') as number) ?? 0.2;
    this.metronome.start(currentPositionTicks, barTicks, meterBeatTicks, playbackDelay);
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

  public setTrackPan(trackId: string, pan: number): void {
    try {
      const audioBus = this.trackAudioBuses.get(trackId);
      const playerBus = this.trackAudioPlayerBuses.get(trackId);
      if (audioBus) {
        audioBus.setPan(pan);
      }
      if (playerBus) {
        playerBus.setPan(pan);
      }
      if (!audioBus && !playerBus) {
        console.warn(`No audio bus found for track ${trackId}`);
      }
    } catch (error) {
      console.error(`Error setting track ${trackId} pan:`, error);
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

  public getTrackPan(trackId: string): number {
    const audioBus = this.trackAudioBuses.get(trackId);
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    return audioBus?.getPan() ?? playerBus?.getPan() ?? 0;
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
    return [...Object.keys(FLUIDR3_INSTRUMENT_MAP), ...UserInstrumentRegistry.listEnabled().map(item => item.instrumentId)] as InstrumentType[];
  }

  public async refreshUserInstruments(instrumentIds: Iterable<string>): Promise<void> {
    const ids = new Set(instrumentIds);
    ids.forEach(id => KGToneBuffersPool.instance().invalidateInstrument(id));
    const project = KGCore.instance().getCurrentProject();
    for (const track of project.getTracks()) {
      if (track instanceof KGMidiTrack && ids.has(String(track.getInstrument()))) {
        await this.setTrackInstrument(track.getId().toString(), track.getInstrument());
      }
    }
  }

  public getCaptureStream(): MediaStream | null {
    return this.captureStream;
  }

  private clearDelayedTransportStart(): void {
    if (this.delayedTransportStartTimeoutId !== null) {
      Tone.getContext().clearTimeout(this.delayedTransportStartTimeoutId);
      this.delayedTransportStartTimeoutId = null;
    }

    this.delayedTransportStartSeconds = 0;
    this.virtualPrerollStartTick = null;
    this.virtualPrerollStartAudioTime = null;
  }

  // ===== PRIVATE UTILITY METHODS =====

  private applyTrackAutomationAtBeat(track: { getId(): number; getVolumeAutomation(): Array<{ getTick(): number; getValue(): number }>; getPanAutomation(): Array<{ getTick(): number; getValue(): number }> }, tick: number): void {
    const trackId = track.getId().toString();
    const audioBus = this.trackAudioBuses.get(trackId);
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    const volumePoints = track.getVolumeAutomation().map(point => ({ tick: point.getTick(), value: point.getValue() }));
    const panPoints = track.getPanAutomation().map(point => ({ tick: point.getTick(), value: point.getValue() }));

    const nextVolume = volumePoints.length > 0
      ? resolveTrackAutomationValueAtTick(volumePoints, 'volume', tick, getTrackAutomationDefaultValue('volume'))
      : null;
    const nextPan = panPoints.length > 0
      ? resolveTrackAutomationValueAtTick(panPoints, 'pan', tick, getTrackAutomationDefaultValue('pan'))
      : null;

    if (audioBus) {
      audioBus.setAutomationVolume(nextVolume);
      audioBus.setAutomationPan(nextPan);
    }
    if (playerBus) {
      playerBus.setAutomationVolume(nextVolume);
      playerBus.setAutomationPan(nextPan);
    }
    this.updateAllEffectiveVolumes();
  }

  private applyTrackAutomationForCurrentBeat(trackId: string): void {
    const project = KGCore.instance().getCurrentProject();
    const track = project.getTracks().find(candidate => candidate.getId().toString() === trackId);
    if (!track) {
      return;
    }

    this.applyTrackAutomationAtBeat(track, this.getTransportPosition());
  }

  private scheduleTrackAutomation(
    track: { getId(): number; getVolumeAutomation(): Array<{ getTick(): number; getValue(): number }>; getPanAutomation(): Array<{ getTick(): number; getValue(): number }> },
    windowStartTick: number,
    windowEndTick: number,
    interpolationIntervalMs: number,
    bpm: number,
    includeWindowStart = false
  ): void {
    const trackId = track.getId().toString();
    const audioBus = this.trackAudioBuses.get(trackId);
    const playerBus = this.trackAudioPlayerBuses.get(trackId);
    if (!audioBus && !playerBus) {
      return;
    }

    const volumePoints = track.getVolumeAutomation().map(point => ({ tick: point.getTick(), value: point.getValue() }));
    const panPoints = track.getPanAutomation().map(point => ({ tick: point.getTick(), value: point.getValue() }));

    bakeTrackAutomationPointsInWindow(volumePoints, 'volume', windowStartTick, windowEndTick, interpolationIntervalMs, bpm)
      .forEach(({ tick, value }) => {
        if (includeWindowStart ? tick < windowStartTick : tick <= windowStartTick) {
          return;
        }

        const eventId = Tone.Transport.schedule(() => {
          if (audioBus) {
            audioBus.setAutomationVolume(value);
          }
          if (playerBus) {
            playerBus.setAutomationVolume(value);
          }
          this.updateAllEffectiveVolumes();
        }, this.projectTickToTransportTime(tick));
        this.scheduledEvents.add(eventId);
      });

    bakeTrackAutomationPointsInWindow(panPoints, 'pan', windowStartTick, windowEndTick, interpolationIntervalMs, bpm)
      .forEach(({ tick, value }) => {
        if (includeWindowStart ? tick < windowStartTick : tick <= windowStartTick) {
          return;
        }

        const eventId = Tone.Transport.schedule((time) => {
          if (audioBus) {
            audioBus.scheduleAutomationPan(value, time);
          }
          if (playerBus) {
            playerBus.scheduleAutomationPan(value, time);
          }
        }, this.projectTickToTransportTime(tick));
        this.scheduledEvents.add(eventId);
      });
  }

  private scheduleTempoChanges(project: KGProject, windowStartTick: number, windowEndTick: number): void {
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      return;
    }

    const projectTicksPerBar = ticksPerBar(project.getTimeSignature());
    const tempoRegions = getSortedTempoRegions(tempoTrack, projectTicksPerBar);
    if (tempoRegions.length === 0) {
      return;
    }

    tempoRegions.forEach((region) => {
      const regionStartTick = region.getStartTick();
      if (regionStartTick <= windowStartTick || regionStartTick >= windowEndTick) {
        return;
      }

      const eventId = Tone.Transport.schedule(() => {
        Tone.Transport.bpm.value = region.getBpm();
      }, this.projectTickToTransportTime(regionStartTick));
      this.scheduledEvents.add(eventId);
    });
  }

  private clearTrackAutomationOverrides(): void {
    this.trackAudioBuses.forEach(audioBus => {
      audioBus.setAutomationVolume(null);
      audioBus.setAutomationPan(null);
    });
    this.trackAudioPlayerBuses.forEach(playerBus => {
      playerBus.setAutomationVolume(null);
      playerBus.setAutomationPan(null);
    });
    this.updateAllEffectiveVolumes();
  }

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

  private setPlaybackOrigin(project: KGProject, tick: number): void {
    this.playbackOriginTick = Math.max(0, Math.round(tick));
    this.playbackOriginSeconds = tickToSeconds(project, this.playbackOriginTick);
  }

  private resetPlaybackOrigin(): void {
    this.playbackOriginTick = 0;
    this.playbackOriginSeconds = 0;
  }

  private projectTickToTransportTime(tick: number): Tone.Unit.Time {
    const clampedTick = Math.max(0, tick);
    const transportTicks = Math.round(clampedTick - this.playbackOriginTick);
    return transportTicks === 0 ? 0 : `${transportTicks}i` as Tone.Unit.Time;
  }

  private transportTimeToProjectTick(project: KGProject, toneTime: Tone.Unit.Time): number {
    if (typeof toneTime === 'string' && toneTime.endsWith('i')) {
      const ticks = Number.parseFloat(toneTime.slice(0, -1));
      return this.playbackOriginTick + (Number.isFinite(ticks) ? ticks : 0);
    }

    const numericTime = typeof toneTime === 'number' ? toneTime : Tone.Time(toneTime).toSeconds();
    return secondsToTick(project, this.playbackOriginSeconds + Math.max(0, numericTime));
  }

  /** Convert Tone.js time format to project ticks. */
  private toneTimeToTicks(toneTime: Tone.Unit.Time): number {
    const seconds = Tone.Time(toneTime).toSeconds();
    return secondsToTick(KGCore.instance().getCurrentProject(), seconds);
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
