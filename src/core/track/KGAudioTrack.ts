import { Expose, Type } from 'class-transformer';
import { KGTrack, TrackType } from './KGTrack';
import { KGRegion } from '../region/KGRegion';
import { KGAudioRegion } from '../region/KGAudioRegion';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

export class KGAudioTrack extends KGTrack {
  @Expose()
  protected override __type: string = 'KGAudioTrack';

  @Expose()
  @Type(() => KGRegion, {
    discriminator: {
      property: '__type',
      subTypes: [
        { value: KGRegion, name: 'KGRegion' },
        { value: KGAudioRegion, name: 'KGAudioRegion' },
      ],
    },
  })
  protected override regions: KGAudioRegion[] = [];

  constructor(name: string = 'Untitled Audio Track', id: number = 0, volume: number = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME) {
    super(name, id, TrackType.Wave);
    this.__type = 'KGAudioTrack';
    this.volume = volume;
  }

  // Override parent setRegions to enforce KGAudioRegion type
  public override setRegions(regions: KGAudioRegion[]): void {
    this.regions = regions;
  }

  // Override getCurrentType to return specific subclass type
  public override getCurrentType(): string {
    return 'KGAudioTrack';
  }
}
