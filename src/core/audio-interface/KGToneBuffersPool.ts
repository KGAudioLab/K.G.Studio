import { SAMPLER_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import * as Tone from 'tone';

/**
 * KGToneBuffersPool - Singleton class for managing ToneAudioBuffers
 * Handles loading and caching of soundfont audio buffers for instruments
 */
export class KGToneBuffersPool {
  // Private static instance for singleton pattern
  private static _instance: KGToneBuffersPool | null = null;

  // Map to store ToneAudioBuffers by instrument name
  private bufferMap: Map<string, Tone.ToneAudioBuffers> = new Map();
  
  // Map to store loading promises to prevent duplicate loading and handle race conditions
  private loadingPromises: Map<string, Promise<Tone.ToneAudioBuffers>> = new Map();

  // Simple event listeners for load start/end without coupling to UI layer
  private loadingListeners: Array<(_evt: { type: 'start' | 'end'; instrument: string }) => void> = [];

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("KGToneBuffersPool initialized");
  }

  /**
   * Get the singleton instance of KGToneBuffersPool
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): KGToneBuffersPool {
    if (!KGToneBuffersPool._instance) {
      KGToneBuffersPool._instance = new KGToneBuffersPool();
    }
    return KGToneBuffersPool._instance;
  }

  /** Get the number of instruments currently loading */
  public getActiveLoadCount(): number {
    return this.loadingPromises.size;
  }

  /** Register a listener for buffer loading events */
  public addLoadingListener(listener: (_evt: { type: 'start' | 'end'; instrument: string }) => void): void {
    this.loadingListeners.push(listener);
  }

  /** Unregister a previously added listener */
  public removeLoadingListener(listener: (_evt: { type: 'start' | 'end'; instrument: string }) => void): void {
    this.loadingListeners = this.loadingListeners.filter(l => l !== listener);
  }

  private emitLoadingEvent(_evt: { type: 'start' | 'end'; instrument: string }): void {
    try {
      this.loadingListeners.forEach(l => {
        try { l(_evt); } catch { /* swallow listener errors */ }
      });
    } catch {
      // no-op
    }
  }

  /**
   * Get ToneAudioBuffers for a specific instrument name
   * If not cached, creates and loads the buffers
   * Handles race conditions by ensuring only one loading operation per instrument
   */
  public async getToneAudioBuffers(name: string): Promise<Tone.ToneAudioBuffers> {
    // Check if already fully loaded and cached
    const cachedBuffers = this.bufferMap.get(name);
    if (cachedBuffers && cachedBuffers.loaded) {
      console.log(`KGToneBuffersPool: Returning cached buffers for ${name}`);
      return cachedBuffers;
    }

    // Check if currently loading - if so, wait for that promise
    if (this.loadingPromises.has(name)) {
      console.log(`KGToneBuffersPool: Waiting for existing loading operation for ${name}`);
      return await this.loadingPromises.get(name)!;
    }

    // Start new loading operation
    console.log(`KGToneBuffersPool: Starting new loading operation for ${name}`);
    const loadingPromise = this.createToneAudioBuffers(name);
    this.loadingPromises.set(name, loadingPromise);
    // Emit start AFTER registering the promise to avoid duplicate start events in races
    this.emitLoadingEvent({ type: 'start', instrument: name });
    console.log(`[KGToneBuffersPool] start: Active load count: ${this.getActiveLoadCount()}`);

    try {
      const buffers = await loadingPromise;
      
      // Cache the fully loaded buffers
      this.bufferMap.set(name, buffers);
      console.log(`KGToneBuffersPool: Cached loaded buffers for ${name}`);
      
      // Remove from loading promises since it's complete
      this.loadingPromises.delete(name);
      this.emitLoadingEvent({ type: 'end', instrument: name });
      console.log(`[KGToneBuffersPool] end: Active load count: ${this.getActiveLoadCount()}`);
      
      return buffers;
    } catch (error) {
      // Remove failed loading promise so it can be retried
      this.loadingPromises.delete(name);
      console.error(`KGToneBuffersPool: Failed to load buffers for ${name}:`, error);
      // Emit end to allow UI to close spinner even on failure
      this.emitLoadingEvent({ type: 'end', instrument: name });
      console.log(`[KGToneBuffersPool] end: Active load count: ${this.getActiveLoadCount()}`);
      throw error;
    }
  }

  /**
   * Create ToneAudioBuffers for an instrument
   */
  private async createToneAudioBuffers(name: string): Promise<Tone.ToneAudioBuffers> {
    return new Promise((resolve, reject) => {
      try {
        // Get instrument configuration from constants
        const fluidConfig = SAMPLER_CONSTANTS.TONE_SAMPLERS.FLUID;
        const instrumentName = name;
        
        if (!instrumentName) {
          throw new Error(`Unknown instrument: ${name}`);
        }

        // Generate URL mapping for all keys from A0 to Bb7
        const urls = this.generateKeyUrls(fluidConfig.url, instrumentName);
        
        console.log(`Loading ToneAudioBuffers for ${name} (${instrumentName})...`);
        
        // Create ToneAudioBuffers with onload callback
        const buffers = new Tone.ToneAudioBuffers(
          urls,
          () => {
            console.log(`ToneAudioBuffers loaded successfully for ${name}`);
            resolve(buffers);
          }
        );

        // Don't cache until loading is complete - this will be handled in getToneAudioBuffers
        
      } catch (error) {
        console.error(`Error creating ToneAudioBuffers for ${name}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Generate URL mapping for all keys from A0 to Bb7
   * Uses Db notation instead of C# as specified
   */
  private generateKeyUrls(baseUrl: string, instrumentName: string): { [key: string]: string } {
    const urls: { [key: string]: string } = {};

    // get the range of the instrument. 
    // TODO: make the sound library name configurable.
    const range = FLUIDR3_INSTRUMENT_MAP[instrumentName]?.pitchRange || [21, 108];
    
    // Note names in order (using flats instead of sharps where applicable)
    const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    
    // Generate keys from A0 to C8 (MIDI notes 21 to 108)
    for (let midiNote = range[0]; midiNote <= range[1]; midiNote++) {
      const octave = Math.floor((midiNote - 12) / 12);
      const noteIndex = (midiNote - 12) % 12;
      const noteName = noteNames[noteIndex];
      const keyName = `${noteName}${octave}`;
      
      // Generate URL for this key
      urls[keyName] = `${baseUrl}${instrumentName}-mp3/${keyName}.mp3`;
    }
    
    console.log(`Generated ${Object.keys(urls).length} key URLs for ${instrumentName} from A0 to Bb7`);
    
    return urls;
  }

  /**
   * Clear all cached buffers and dispose of resources
   */
  public dispose(): void {
    try {
      // Dispose of all ToneAudioBuffers
      this.bufferMap.forEach((buffers, name) => {
        try {
          buffers.dispose();
          console.log(`Disposed ToneAudioBuffers for ${name}`);
        } catch (error) {
          console.error(`Error disposing ToneAudioBuffers for ${name}:`, error);
        }
      });

      // Clear both maps
      this.bufferMap.clear();
      this.loadingPromises.clear();
      
      console.log("KGToneBuffersPool disposed successfully");
    } catch (error) {
      console.error("Error disposing KGToneBuffersPool:", error);
    }
  }

  /**
   * Preload buffers for specific instruments (optional performance optimization)
   */
  public async preloadInstruments(instrumentNames: string[]): Promise<void> {
    const loadPromises = instrumentNames.map(name => 
      this.getToneAudioBuffers(name).catch(error => {
        console.warn(`Failed to preload ${name}:`, error);
      })
    );

    await Promise.allSettled(loadPromises);
    console.log(`Preloading completed for ${instrumentNames.length} instruments`);
  }
}