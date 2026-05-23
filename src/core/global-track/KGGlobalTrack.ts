import { Expose, Type } from 'class-transformer';
import { KGGlobalRegion } from '../region/KGGlobalRegion';
import { KGKeySignatureRegion } from '../region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../region/KGMarkerRegion';

export enum GlobalTrackType {
  Marker = 'marker',
  Tempo = 'tempo',
  Signature = 'signature',
  Chord = 'chord',
}

export class KGGlobalTrack {
  @Expose()
  protected __type: string = 'KGGlobalTrack';

  @Expose()
  protected id: string = '';

  @Expose()
  protected trackIndex: number = 0;

  @Expose()
  protected type: GlobalTrackType = GlobalTrackType.Marker;

  @Expose()
  protected name: string = '';

  @Expose()
  @Type(() => KGGlobalRegion, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGGlobalRegion, name: 'KGGlobalRegion' },
        { value: KGMarkerRegion, name: 'KGMarkerRegion' },
        { value: KGKeySignatureRegion, name: 'KGKeySignatureRegion' },
      ],
    },
  })
  protected regions: KGGlobalRegion[] = [];

  constructor(
    id: string = '',
    trackIndex: number = 0,
    type: GlobalTrackType = GlobalTrackType.Marker,
    name: string = '',
    regions: KGGlobalRegion[] = []
  ) {
    this.id = id;
    this.trackIndex = trackIndex;
    this.type = type;
    this.name = name;
    this.regions = regions;
  }

  public getId(): string {
    return this.id;
  }

  public setId(id: string): void {
    this.id = id;
  }

  public getTrackIndex(): number {
    return this.trackIndex;
  }

  public setTrackIndex(trackIndex: number): void {
    this.trackIndex = trackIndex;
    this.regions.forEach(region => {
      region.setTrackIndex(trackIndex);
      region.setTrackId(this.id);
    });
  }

  public getType(): GlobalTrackType {
    return this.type;
  }

  public setType(type: GlobalTrackType): void {
    this.type = type;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public getRegions(): KGGlobalRegion[] {
    return this.regions;
  }

  public setRegions(regions: KGGlobalRegion[]): void {
    this.regions = regions.map(region => {
      region.setTrackId(this.id);
      region.setTrackIndex(this.trackIndex);
      return region;
    });
  }

  public addRegion(region: KGGlobalRegion): void {
    region.setTrackId(this.id);
    region.setTrackIndex(this.trackIndex);
    this.regions.push(region);
  }

  public removeRegion(regionId: string): void {
    this.regions = this.regions.filter(region => region.getId() !== regionId);
  }

  public getCurrentType(): string {
    return 'KGGlobalTrack';
  }
}
