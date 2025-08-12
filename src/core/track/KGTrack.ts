import { Expose, Type } from 'class-transformer';
import { KGRegion } from '../region/KGRegion';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { WithDefault } from '../../types/projectTypes';

// Track type enum
export enum TrackType {
  MIDI = 'MIDI',
  Chords = 'Chords', 
  Wave = 'Wave'
}

/**
 * KGTrack - Class representing a track in the DAW
 * Contains track settings and data
 */
export class KGTrack {
  @Expose()
  protected __type: string = 'KGTrack';
  
  @Expose()
  protected name: string = '';
  
  @Expose()
  protected id: number = 0;
  
  @Expose()
  protected trackIndex: number = 0;
  
  @Expose()
  protected type: TrackType;

  @Expose()
  @WithDefault(AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME)
  protected volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
  
  @Expose()
  @Type(() => KGRegion, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGRegion, name: 'KGRegion' },
        { value: KGMidiRegion, name: 'KGMidiRegion' },
      ],
    },
  })
  protected regions: KGRegion[] = [];

  constructor(name: string = 'Untitled Track', id: number = 0, type: TrackType = TrackType.MIDI, volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME) {
    this.name = name;
    this.id = id;
    this.type = type;
    this.volume = volume;
  }

  // Getters
  public getName(): string {
    return this.name;
  }

  public getId(): number {
    return this.id;
  }

  public getTrackIndex(): number {
    return this.trackIndex;
  }

  public getType(): TrackType {
    return this.type;
  }

  public getRegions(): KGRegion[] {
    return this.regions;
  }

  public getVolume(): number {
    return this.volume;
  }

  // Setters  
  public setName(name: string): void {
    this.name = name;
  }

  public setId(id: number): void {
    this.id = id;
  }

  public setTrackIndex(trackIndex: number): void {
    this.trackIndex = trackIndex;

    // Update the track index for all regions
    this.regions.forEach(region => {
      region.setTrackIndex(trackIndex);
    });
  }

  public setType(type: TrackType): void {
    this.type = type;
  }

  public setVolume(volume: number): void {
    this.volume = volume;
  }

  public setRegions(regions: KGRegion[]): void {
    this.regions = regions;
  }

  // Add a single region
  public addRegion(region: KGRegion): void {
    this.regions.push(region);
  }

  // Remove a region by ID
  public removeRegion(regionId: string): void {
    this.regions = this.regions.filter(region => region.getId() !== regionId);
  }

  // Type identification method for performance-optimized instanceof checks
  public getRootType(): string {
    return 'KGTrack';
  }

  // Current type identification for copy/paste operations
  public getCurrentType(): string {
    return 'KGTrack';
  }
}
