import { Expose, Type } from 'class-transformer';
import { KGTrack } from './track/KGTrack';
import { KGMidiTrack } from './track/KGMidiTrack';
import { type TimeSignature, WithDefault } from '../types/projectTypes';
import { TIME_CONSTANTS, KEY_SIGNATURE_MAP } from '../constants/coreConstants';

// Type for valid key signatures
export type KeySignature = keyof typeof KEY_SIGNATURE_MAP;

/**
 * KGProject - Class representing a project in the DAW
 * Contains project settings and track data
 */
export class KGProject {
  @Expose()
  private name: string = "Untitled Project";
  
  @Expose()
  private maxBars: number = 32;
  
  @Expose()
  private currentBars: number = 0;
  
  @Expose()
  private timeSignature: TimeSignature = TIME_CONSTANTS.DEFAULT_TIME_SIGNATURE;
  
  @Expose()
  private bpm: number = TIME_CONSTANTS.DEFAULT_BPM;
  
  @Expose()
  @WithDefault("C major")
  private keySignature: KeySignature = "C major";

  @Expose()
  @WithDefault("ionian")
  private selectedMode: string = "ionian";

  @Expose()
  @WithDefault(false)
  private isLooping: boolean = false;

  @Expose()
  @WithDefault([0, 0])
  private loopingRange: [number, number] = [0, 0]; // [startBar, endBar] - bar indices (0-based)

  @Expose()
  @WithDefault(0)
  private projectStructureVersion: number = 0;

  public static readonly CURRENT_PROJECT_STRUCTURE_VERSION: number = 2;
  
  @Expose()
  @Type(() => KGTrack, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGTrack, name: 'KGTrack' },
        { value: KGMidiTrack, name: 'KGMidiTrack' },
      ],
    },
  })
  private tracks: KGTrack[] = [];

  // Constructor
  constructor(name: string = "Untitled Project", maxBars: number = 32, currentBars: number = 0, bpm: number = 125, timeSignature: TimeSignature = { numerator: 4, denominator: 4 }, keySignature: KeySignature = "C major", selectedMode: string = "ionian", isLooping: boolean = false, loopingRange: [number, number] = [0, 0], tracks: KGTrack[] = [], projectStructureVersion: number = KGProject.CURRENT_PROJECT_STRUCTURE_VERSION) {
    this.name = name;
    this.maxBars = maxBars;
    this.currentBars = currentBars;
    this.bpm = bpm;
    this.timeSignature = timeSignature;
    this.keySignature = keySignature;
    this.selectedMode = selectedMode;
    this.isLooping = isLooping;
    this.loopingRange = loopingRange;
    this.tracks = tracks;
    this.projectStructureVersion = projectStructureVersion;
  }

  // Getters
  public getName(): string {
    return this.name;
  }

  public getMaxBars(): number {
    return this.maxBars;
  }

  public getCurrentBars(): number {
    return this.currentBars;
  }

  public getTimeSignature(): TimeSignature {
    return this.timeSignature;
  }

  public setTimeSignature(timeSignature: TimeSignature): void {
    this.timeSignature = timeSignature;
  }

  public getBpm(): number {
    return this.bpm;
  }

  public getKeySignature(): KeySignature {
    return this.keySignature;
  }

  public getSelectedMode(): string {
    return this.selectedMode;
  }

  public getTracks(): KGTrack[] {
    return this.tracks;
  }

  // Setters
  public setName(name: string): void {
    this.name = name;
  }

  public setMaxBars(maxBars: number): void {
    this.maxBars = maxBars;
  }

  public setCurrentBars(currentBars: number): void {
    this.currentBars = currentBars;
  }

  public setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  public setKeySignature(keySignature: KeySignature): void {
    this.keySignature = keySignature;
  }

  public setSelectedMode(selectedMode: string): void {
    this.selectedMode = selectedMode;
  }

  public setTracks(tracks: KGTrack[]): void {
    this.tracks = tracks;
  }

  public setProjectStructureVersion(projectStructureVersion: number): void {
    this.projectStructureVersion = projectStructureVersion;
  }

  public getProjectStructureVersion(): number {
    return this.projectStructureVersion;
  }

  public getIsLooping(): boolean {
    return this.isLooping;
  }

  public setIsLooping(isLooping: boolean): void {
    this.isLooping = isLooping;
  }

  public getLoopingRange(): [number, number] {
    return this.loopingRange;
  }

  public setLoopingRange(loopingRange: [number, number]): void {
    this.loopingRange = loopingRange;
  }
}

