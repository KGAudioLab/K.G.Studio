import { Expose } from 'class-transformer';
import { GlobalTrackType, KGGlobalTrack } from './KGGlobalTrack';

export class KGMarkerTrack extends KGGlobalTrack {
  @Expose()
  protected override __type: string = 'KGMarkerTrack';

  constructor(id: string = 'global-marker', trackIndex: number = 0, name: string = 'Marker') {
    super(id, trackIndex, GlobalTrackType.Marker, name, []);
    this.__type = 'KGMarkerTrack';
  }

  public override getCurrentType(): string {
    return 'KGMarkerTrack';
  }
}
