import * as Tone from 'tone';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { createStereoTrackPanner } from './createStereoTrackPanner';

/**
 * KGAudioPlayerBus - Represents an audio playback bus for a track.
 * Parallel to KGAudioBus but wraps a Tone.Gain node + a buffer cache
 * instead of a Tone.Sampler. Supports multiple audio files per track
 * via ToneBufferSource instances created on-demand during playback.
 */
export class KGAudioPlayerBus {
  // Gain node for volume/mute routing
  private gainNode: Tone.Gain;
  private pannerNode: Tone.Panner;

  // Cached audio buffers keyed by audioFileId
  private audioBuffers: Map<string, Tone.ToneAudioBuffer> = new Map();

  // Active buffer sources for cleanup on stop
  private activeSources: Tone.ToneBufferSource[] = [];

  // Audio properties
  private volume: number;
  private automationVolume: number | null = null;
  private pan: number;
  private automationPan: number | null = null;
  private muted: boolean;
  private solo: boolean;

  /**
   * Private constructor - use KGAudioPlayerBus.create() instead
   */
  private constructor(
    gainNode: Tone.Gain,
    pannerNode: Tone.Panner,
    volume: number,
    pan: number,
    muted: boolean,
    solo: boolean
  ) {
    this.gainNode = gainNode;
    this.pannerNode = pannerNode;
    this.volume = volume;
    this.pan = pan;
    this.muted = muted;
    this.solo = solo;

    this.updateGainVolume();
    this.updatePanValue();

    console.log(`KGAudioPlayerBus created - volume: ${volume}, muted: ${muted}, solo: ${solo}`);
  }

  /**
   * Create a new KGAudioPlayerBus instance (async factory method)
   */
  public static async create(
    volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME,
    pan: number = 0,
    muted: boolean = false,
    solo: boolean = false
  ): Promise<KGAudioPlayerBus> {
    try {
      const gainNode = new Tone.Gain(1);
      const pannerNode = createStereoTrackPanner(pan);
      gainNode.connect(pannerNode);
      const bus = new KGAudioPlayerBus(gainNode, pannerNode, volume, pan, muted, solo);
      console.log('KGAudioPlayerBus created successfully');
      return bus;
    } catch (error) {
      console.error('Failed to create KGAudioPlayerBus:', error);
      throw error;
    }
  }

  // ===== BUFFER MANAGEMENT =====

  /**
   * Load/cache an audio buffer for a given audioFileId
   */
  public loadBuffer(audioFileId: string, buffer: Tone.ToneAudioBuffer): void {
    this.audioBuffers.set(audioFileId, buffer);
    console.log(`Loaded audio buffer for ${audioFileId}, duration: ${buffer.duration}s`);
  }

  /**
   * Check if a buffer is cached for the given audioFileId
   */
  public hasBuffer(audioFileId: string): boolean {
    return this.audioBuffers.has(audioFileId);
  }

  /**
   * Remove and dispose a cached buffer
   */
  public removeBuffer(audioFileId: string): void {
    const buffer = this.audioBuffers.get(audioFileId);
    if (buffer) {
      buffer.dispose();
      this.audioBuffers.delete(audioFileId);
      console.log(`Removed audio buffer for ${audioFileId}`);
    }
  }

  /**
   * Get the raw AudioBuffer for waveform rendering
   */
  public getAudioBuffer(audioFileId: string): AudioBuffer | undefined {
    const toneBuffer = this.audioBuffers.get(audioFileId);
    return toneBuffer?.get() as AudioBuffer | undefined;
  }

  // ===== PLAYBACK =====

  /**
   * Schedule playback of an audio buffer at a specific time.
   * Creates a new ToneBufferSource each call (stateless, safe for loop re-triggering).
   */
  public schedulePlayback(
    time: number,
    audioFileId: string,
    offset: number = 0,
    duration?: number
  ): void {
    const buffer = this.audioBuffers.get(audioFileId);
    if (!buffer) {
      console.error(`No audio buffer found for ${audioFileId}`);
      return;
    }

    try {
      const source = new Tone.ToneBufferSource(buffer);
      source.connect(this.gainNode);

      // Ensure start time is not in the past — ToneBufferSource silently fails
      // if the time has already passed, unlike Sampler which handles it gracefully.
      const safeTime = Math.max(time, Tone.now());

      if (duration !== undefined) {
        source.start(safeTime, offset, duration);
      } else {
        source.start(safeTime, offset);
      }

      this.activeSources.push(source);

      // Clean up source reference after it finishes
      source.onended = () => {
        const idx = this.activeSources.indexOf(source);
        if (idx !== -1) {
          this.activeSources.splice(idx, 1);
        }
        source.dispose();
      };
    } catch (error) {
      console.error(`Error scheduling playback for ${audioFileId}:`, error);
    }
  }

  /**
   * Stop all active audio sources
   */
  public stopAll(): void {
    try {
      for (const source of this.activeSources) {
        try {
          source.stop();
        } catch {
          // Source may have already stopped
        }
        // Don't dispose here — the onended callback handles disposal.
        // Double-dispose corrupts Tone.js internal state.
      }
      this.activeSources = [];
    } catch (error) {
      console.error('Error stopping all audio sources:', error);
    }
  }

  // ===== AUDIO PROPERTIES =====

  public setVolume(volume: number): void {
    this.volume = volume;
    this.updateGainVolume();
    console.log(`Set audio player bus volume to ${volume}`);
  }

  public setAutomationVolume(volume: number | null): void {
    this.automationVolume = volume;
    this.updateGainVolume();
  }

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
    if (typeof this.pannerNode.pan.setValueAtTime === 'function') {
      this.pannerNode.pan.setValueAtTime(clampedPan, time);
      return;
    }

    this.pannerNode.pan.value = clampedPan;
  }

  public getPan(): number {
    return this.pan;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateGainVolume();
    console.log(`Set audio player bus muted to ${muted}`);
  }

  public getMuted(): boolean {
    return this.muted;
  }

  public setSolo(solo: boolean): void {
    this.solo = solo;
    console.log(`Set audio player bus solo to ${solo}`);
  }

  public getSolo(): boolean {
    return this.solo;
  }

  /**
   * Apply effective volume considering both mute and solo context
   */
  public applyEffectiveVolume(hasSoloedTracks: boolean): void {
    try {
      const effectiveVolume = this.automationVolume ?? this.volume;
      const isSilent = this.muted || (hasSoloedTracks && !this.solo) || effectiveVolume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.gainNode.gain.value = isSilent ? 0 : Math.pow(10, effectiveVolume / 20);
    } catch (error) {
      console.error('Error applying effective volume for audio player bus:', error);
    }
  }

  /**
   * Check if this audio bus should play considering solo logic
   */
  public shouldPlayWithSolo(hasSoloedTracks: boolean): boolean {
    if (this.muted) {
      return false;
    }
    if (hasSoloedTracks) {
      return this.solo;
    }
    return true;
  }

  // ===== AUDIO ROUTING =====

  public connect(destination: Tone.InputNode): void {
    try {
      this.pannerNode.connect(destination);
      console.log('Connected audio player bus to destination');
    } catch (error) {
      console.error('Error connecting audio player bus:', error);
    }
  }

  public disconnect(): void {
    try {
      this.pannerNode.disconnect();
      console.log('Disconnected audio player bus');
    } catch (error) {
      console.error('Error disconnecting audio player bus:', error);
    }
  }

  // ===== RESOURCE MANAGEMENT =====

  public dispose(): void {
    try {
      this.stopAll();
      for (const buffer of this.audioBuffers.values()) {
        buffer.dispose();
      }
      this.audioBuffers.clear();
      this.gainNode.dispose();
      this.pannerNode.dispose();
      console.log('Disposed KGAudioPlayerBus');
    } catch (error) {
      console.error('Error disposing KGAudioPlayerBus:', error);
    }
  }

  // ===== PRIVATE UTILITY =====

  private updateGainVolume(): void {
    try {
      const effectiveVolume = this.automationVolume ?? this.volume;
      const isSilent = this.muted || effectiveVolume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
      this.gainNode.gain.value = isSilent ? 0 : Math.pow(10, effectiveVolume / 20);
    } catch (error) {
      console.error('Error updating gain volume:', error);
    }
  }

  private updatePanValue(): void {
    try {
      const effectivePan = this.automationPan ?? this.pan;
      if (typeof this.pannerNode.pan.setValueAtTime === 'function') {
        this.pannerNode.pan.setValueAtTime(effectivePan, Tone.now());
      } else {
        this.pannerNode.pan.value = effectivePan;
      }
    } catch (error) {
      console.error('Error updating audio player pan:', error);
    }
  }

  // ===== DEBUGGING =====

  public getState(): {
    volume: number;
    pan: number;
    muted: boolean;
    solo: boolean;
    bufferCount: number;
    activeSourceCount: number;
  } {
    return {
      volume: this.volume,
      pan: this.pan,
      muted: this.muted,
      solo: this.solo,
      bufferCount: this.audioBuffers.size,
      activeSourceCount: this.activeSources.length,
    };
  }
}
