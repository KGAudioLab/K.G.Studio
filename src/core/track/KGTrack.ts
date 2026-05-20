import { Expose, Type } from 'class-transformer';
import { KGRegion } from '../region/KGRegion';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGAudioRegion } from '../region/KGAudioRegion';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { WithDefault } from '../../types/projectTypes';
import { KGTrackAutomationPoint, type TrackAutomationType } from './KGTrackAutomationPoint';
import { clampTrackAutomationValue } from '../../util/trackAutomationUtil';

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
  @WithDefault(false)
  protected muted: boolean = false;

  @Expose()
  @WithDefault(false)
  protected solo: boolean = false;
  
  @Expose()
  @Type(() => KGRegion, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGRegion, name: 'KGRegion' },
        { value: KGMidiRegion, name: 'KGMidiRegion' },
        { value: KGAudioRegion, name: 'KGAudioRegion' },
      ],
    },
  })
  protected regions: KGRegion[] = [];

  @Expose()
  @Type(() => KGTrackAutomationPoint)
  protected volumeAutomation: KGTrackAutomationPoint[] = [];

  @Expose()
  @Type(() => KGTrackAutomationPoint)
  protected panAutomation: KGTrackAutomationPoint[] = [];

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

  public getMuted(): boolean {
    return this.muted;
  }

  public getSolo(): boolean {
    return this.solo;
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
    this.volume = Math.max(
      AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
      Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, volume)
    );
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public setSolo(solo: boolean): void {
    this.solo = solo;
  }

  public setRegions(regions: KGRegion[]): void {
    this.regions = regions;
  }

  public getVolumeAutomation(): KGTrackAutomationPoint[] {
    return this.volumeAutomation;
  }

  public setVolumeAutomation(points: KGTrackAutomationPoint[]): void {
    this.volumeAutomation = points
      .map(point => {
        point.setValue(clampTrackAutomationValue('volume', point.getValue()));
        return point;
      })
      .sort((left, right) => left.getBeat() - right.getBeat());
  }

  public getPanAutomation(): KGTrackAutomationPoint[] {
    return this.panAutomation;
  }

  public setPanAutomation(points: KGTrackAutomationPoint[]): void {
    this.panAutomation = points
      .map(point => {
        point.setValue(clampTrackAutomationValue('pan', point.getValue()));
        return point;
      })
      .sort((left, right) => left.getBeat() - right.getBeat());
  }

  public getAutomationPoints(type: TrackAutomationType): KGTrackAutomationPoint[] {
    return type === 'volume' ? this.volumeAutomation : this.panAutomation;
  }

  public setAutomationPoints(type: TrackAutomationType, points: KGTrackAutomationPoint[]): void {
    if (type === 'volume') {
      this.setVolumeAutomation(points);
      return;
    }

    this.setPanAutomation(points);
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
