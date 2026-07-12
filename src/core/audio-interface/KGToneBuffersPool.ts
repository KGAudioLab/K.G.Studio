import { SAMPLER_CONSTANTS } from '../../constants/coreConstants';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { ConfigManager } from '../config/ConfigManager';
import { SoundfontInstrumentCache } from '../../util/soundfontInstrumentCache';
import * as Tone from 'tone';
import { UserInstrumentRegistry } from '../instruments/UserInstrumentRegistry';

interface ToneBufferLoadResult {
  buffers: Tone.ToneAudioBuffers;
  cacheInMemory: boolean;
}

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

  private activeBaseUrl: string | null = null;

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
    const baseUrl = await this.getSoundfontBaseUrl();
    this.ensureMemoryCacheMatchesBaseUrl(baseUrl);

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
    const loadingPromise = this.createToneAudioBuffers(name, baseUrl);
    this.loadingPromises.set(name, loadingPromise.then(result => result.buffers));
    // Emit start AFTER registering the promise to avoid duplicate start events in races
    this.emitLoadingEvent({ type: 'start', instrument: name });
    console.log(`[KGToneBuffersPool] start: Active load count: ${this.getActiveLoadCount()}`);

    try {
      const result = await loadingPromise;
      const buffers = result.buffers;

      if (result.cacheInMemory) {
        this.bufferMap.set(name, buffers);
        console.log(`KGToneBuffersPool: Cached loaded buffers for ${name}`);
      } else {
        console.log(`KGToneBuffersPool: Skipping in-memory cache for ${name} due to partial soundfont load`);
      }

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
  private async createToneAudioBuffers(name: string, baseUrl: string): Promise<ToneBufferLoadResult> {
    const instrumentName = name;

    if (!instrumentName) {
      throw new Error(`Unknown instrument: ${name}`);
    }

    const userInstrument = UserInstrumentRegistry.get(instrumentName);
    if (userInstrument) {
      const files = await UserInstrumentRegistry.getSampleFiles(instrumentName);
      const urls: Record<string, string> = {};
      Object.entries(files).forEach(([pitch, file]) => {
        urls[this.pitchToKeyName(Number(pitch))] = URL.createObjectURL(file);
      });
      return { buffers: await this.loadToneAudioBuffers(urls, name), cacheInMemory: true };
    }

    const keyNames = this.getInstrumentKeyNames(instrumentName);

    try {
      if (await SoundfontInstrumentCache.exists(instrumentName, keyNames, baseUrl)) {
        console.log(`Loading ToneAudioBuffers for ${name} from OPFS cache...`);
        const cachedUrls = await SoundfontInstrumentCache.getInstrumentObjectUrls(instrumentName, keyNames, baseUrl);
        try {
          const buffers = await this.loadToneAudioBuffers(cachedUrls, name);
          return { buffers, cacheInMemory: true };
        } catch (error) {
          console.warn(`Cached soundfont load failed for ${name}, deleting cache and retrying remote download.`, error);
          this.revokeObjectUrls(cachedUrls);
          await SoundfontInstrumentCache.deleteInstrument(instrumentName);
        }
      }

      console.log(`Loading ToneAudioBuffers for ${name} (${instrumentName}) from remote source...`);
      const remoteUrls = this.generateKeyUrls(baseUrl, instrumentName);
      const fetchResults = await this.fetchRemoteInstrumentBlobs(remoteUrls);
      const successfulKeys = Object.keys(fetchResults.successfulBlobs);

      if (successfulKeys.length === 0) {
        throw new Error(`Failed to load any soundfont samples for ${instrumentName}`);
      }

      const loadUrls = Object.fromEntries(
        successfulKeys.map(key => [key, URL.createObjectURL(fetchResults.successfulBlobs[key])]),
      ) as Record<string, string>;

      const buffers = await this.loadToneAudioBuffers(loadUrls, name);

      if (fetchResults.failures.length === 0) {
        try {
          await SoundfontInstrumentCache.storeInstrument(instrumentName, keyNames, fetchResults.successfulBlobs, baseUrl);
        } catch (error) {
          console.warn(`Failed to persist soundfont cache for ${instrumentName}:`, error);
        }
      } else {
        console.warn(`Skipping cache finalize for ${instrumentName} because ${fetchResults.failures.length} pitch samples failed to load.`);
        await SoundfontInstrumentCache.deleteInstrument(instrumentName);
      }

      return {
        buffers,
        cacheInMemory: fetchResults.failures.length === 0,
      };
    } catch (error) {
      console.error(`Error creating ToneAudioBuffers for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Generate URL mapping for all keys from A0 to Bb7
   * Uses Db notation instead of C# as specified
   */
  private generateKeyUrls(baseUrl: string, instrumentName: string): { [key: string]: string } {
    const urls: { [key: string]: string } = {};

    for (const keyName of this.getInstrumentKeyNames(instrumentName)) {
      urls[keyName] = `${baseUrl}${instrumentName}-mp3/${keyName}.mp3`;
    }

    console.log(`Generated ${Object.keys(urls).length} key URLs for ${instrumentName} from A0 to Bb7`);

    return urls;
  }

  private getInstrumentKeyNames(instrumentName: string): string[] {
    const range = FLUIDR3_INSTRUMENT_MAP[instrumentName]?.pitchRange || [21, 108];
    const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const keys: string[] = [];

    for (let midiNote = range[0]; midiNote <= range[1]; midiNote++) {
      const octave = Math.floor((midiNote - 12) / 12);
      const noteIndex = (midiNote - 12) % 12;
      const noteName = noteNames[noteIndex];
      keys.push(`${noteName}${octave}`);
    }

    return keys;
  }

  private pitchToKeyName(midiNote: number): string {
    const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return `${noteNames[midiNote % 12]}${Math.floor(midiNote / 12) - 1}`;
  }

  public invalidateInstrument(name: string): void {
    const buffers = this.bufferMap.get(name);
    if (buffers) {
      try { buffers.dispose(); } catch { /* already disposed */ }
      this.bufferMap.delete(name);
    }
    this.loadingPromises.delete(name);
  }

  private async fetchRemoteInstrumentBlobs(urls: Record<string, string>): Promise<{
    successfulBlobs: Record<string, Blob>;
    failures: string[];
  }> {
    const entries = Object.entries(urls);
    const successfulBlobs: Record<string, Blob> = {};
    const failures: string[] = [];

    await Promise.all(entries.map(async ([key, url]) => {
      try {
        const response = await this.fetchWithTimeout(url, 10000);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        successfulBlobs[key] = await response.blob();
      } catch (error) {
        console.warn(`Failed to fetch soundfont sample ${key}:`, error);
        failures.push(key);
      }
    }));

    return { successfulBlobs, failures };
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private loadToneAudioBuffers(urls: Record<string, string>, name: string): Promise<Tone.ToneAudioBuffers> {
    return new Promise((resolve, reject) => {
      if (Object.keys(urls).length === 0) {
        reject(new Error(`No audio sources were available for ${name}`));
        return;
      }

      let settled = false;
      const cleanup = () => this.revokeObjectUrls(urls);

      const buffers = new Tone.ToneAudioBuffers({
        urls,
        onload: () => {
          if (settled) return;
          settled = true;
          cleanup();
          console.log(`ToneAudioBuffers loaded successfully for ${name}`);
          resolve(buffers);
        },
        onerror: (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
      });
    });
  }

  private revokeObjectUrls(urls: Record<string, string>): void {
    Object.values(urls).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  }

  private async getSoundfontBaseUrl(): Promise<string> {
    const configManager = ConfigManager.instance();
    if (!configManager.getIsInitialized()) {
      await configManager.initialize();
    }

    return (configManager.get('general.soundfont.base_url') as string)
      || SAMPLER_CONSTANTS.TONE_SAMPLERS.FLUID.url;
  }

  private ensureMemoryCacheMatchesBaseUrl(baseUrl: string): void {
    if (this.activeBaseUrl === baseUrl) {
      return;
    }

    this.activeBaseUrl = baseUrl;
    this.bufferMap.forEach((buffers, name) => {
      try {
        buffers.dispose();
        console.log(`Disposed ToneAudioBuffers for ${name} due to soundfont base URL change`);
      } catch (error) {
        console.error(`Error disposing ToneAudioBuffers for ${name} during soundfont base URL change:`, error);
      }
    });
    this.bufferMap.clear();
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
