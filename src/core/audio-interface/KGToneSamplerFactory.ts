import * as Tone from 'tone';
import { KGToneBuffersPool } from './KGToneBuffersPool';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';

/**
 * KGToneSamplerFactory - Singleton class for creating Tone.Sampler instances
 * Uses ToneAudioBuffers from KGToneBuffersPool to create samplers with real instrument sounds
 */
export class KGToneSamplerFactory {
    // Private static instance for singleton pattern
    private static _instance: KGToneSamplerFactory | null = null;

    // Private constructor to prevent direct instantiation
    private constructor() {
        console.log("KGToneSamplerFactory initialized");
    }

    /**
     * Get the singleton instance of KGToneSamplerFactory
     * Creates the instance if it doesn't exist yet
     */
    public static instance(): KGToneSamplerFactory {
        if (!KGToneSamplerFactory._instance) {
            KGToneSamplerFactory._instance = new KGToneSamplerFactory();
        }
        return KGToneSamplerFactory._instance;
    }

    /**
     * Create a Tone.Sampler for the specified instrument
     * Uses ToneAudioBuffers from the pool for realistic instrument sounds
     */
    public async createSampler(instrumentName: string): Promise<Tone.Sampler> {
        try {
            console.log(`Creating sampler for instrument: ${instrumentName}`);

            // Get ToneAudioBuffers from the pool
            const buffersPool = KGToneBuffersPool.instance();
            const audioBuffers = await buffersPool.getToneAudioBuffers(instrumentName);

            // Create sampler and wait for it to load
            return new Promise<Tone.Sampler>((resolve, reject) => {
                // Set a timeout to prevent hanging indefinitely
                const timeout = setTimeout(() => {
                    console.error(`Timeout: Sampler failed to load for ${instrumentName} after 30 seconds`);
                    reject(new Error(`Sampler loading timeout for ${instrumentName}`));
                }, 30000); // 30 second timeout

                try {
                    const sampler = new Tone.Sampler({
                        urls: this.convertBuffersToUrls(audioBuffers, FLUIDR3_INSTRUMENT_MAP[instrumentName]?.pitchRange || [21, 108]),
                        onload: () => {
                            clearTimeout(timeout);
                            console.log(`Sampler loaded successfully for ${instrumentName}`);
                            resolve(sampler);
                        },
                        onerror: (error) => {
                            clearTimeout(timeout);
                            console.error(`Sampler failed to load for ${instrumentName}:`, error);
                            reject(new Error(`Sampler loading error for ${instrumentName}: ${error}`));
                        }
                    });

                    console.log(`Sampler created for ${instrumentName}, waiting for load...`);
                } catch (error) {
                    clearTimeout(timeout);
                    console.error(`Failed to create sampler for ${instrumentName}:`, error);
                    reject(error);
                }
            });
        } catch (error) {
            console.error(`Failed to create sampler for ${instrumentName}:`, error);
            throw error;
        }
    }

    /**
     * Convert ToneAudioBuffers to the URL format expected by Tone.Sampler
     * This creates a mapping from note names to the actual audio buffers
     */
    private convertBuffersToUrls(audioBuffers: Tone.ToneAudioBuffers, range: number[] = [21, 118]): { [key: string]: Tone.ToneAudioBuffer } {
        const urls: { [key: string]: Tone.ToneAudioBuffer } = {};

        // Note names in order (using flats instead of sharps where applicable)
        const noteNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

        // Generate keys from A0 to Bb7 (MIDI notes 21 to 118)
        for (let midiNote = range[0]; midiNote <= range[1]; midiNote++) {
            const octave = Math.floor((midiNote - 12) / 12);
            const noteIndex = (midiNote - 12) % 12;
            const noteName = noteNames[noteIndex];
            const keyName = `${noteName}${octave}`;

            // Get the buffer for this key if it exists
            if (audioBuffers.has(keyName)) {
                urls[keyName] = audioBuffers.get(keyName)!;
            }
        }

        console.log(`Converted ${Object.keys(urls).length} audio buffers to sampler format`);
        return urls;
    }

    /**
     * Create multiple samplers for different instruments
     * Useful for preloading multiple instruments at once
     */
    public async createMultipleSamplers(instrumentNames: string[]): Promise<Map<string, Tone.Sampler>> {
        const samplers = new Map<string, Tone.Sampler>();

        try {
            const createPromises = instrumentNames.map(async (instrumentName) => {
                try {
                    const sampler = await this.createSampler(instrumentName);
                    samplers.set(instrumentName, sampler);
                } catch (error) {
                    console.error(`Failed to create sampler for ${instrumentName}:`, error);
                }
            });

            await Promise.allSettled(createPromises);
            console.log(`Created ${samplers.size} samplers out of ${instrumentNames.length} requested`);

            return samplers;
        } catch (error) {
            console.error('Error creating multiple samplers:', error);
            throw error;
        }
    }

    /**
     * Check if a sampler can be created for the given instrument
     * (i.e., if the buffers are available in the pool)
     */
    public async canCreateSampler(instrumentName: string): Promise<boolean> {
        try {
            const buffersPool = KGToneBuffersPool.instance();
            const audioBuffers = await buffersPool.getToneAudioBuffers(instrumentName);
            return audioBuffers.loaded;
        } catch (error) {
            console.warn(`Cannot create sampler for ${instrumentName}:`, error);
            return false;
        }
    }
}