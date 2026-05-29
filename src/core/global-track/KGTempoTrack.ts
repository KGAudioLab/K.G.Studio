import { Expose } from 'class-transformer';
import { GlobalTrackType, KGGlobalTrack } from './KGGlobalTrack';

export class KGTempoTrack extends KGGlobalTrack {
  @Expose()
  protected override __type: string = 'KGTempoTrack';

  constructor(id: string = 'global-tempo', trackIndex: number = 1, name: string = 'Tempo') {
    super(id, trackIndex, GlobalTrackType.Tempo, name, []);
    this.__type = 'KGTempoTrack';
  }

  public override getCurrentType(): string {
    return 'KGTempoTrack';
  }
}
