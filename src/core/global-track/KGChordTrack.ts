import { Expose } from 'class-transformer';
import { GlobalTrackType, KGGlobalTrack } from './KGGlobalTrack';

export class KGChordTrack extends KGGlobalTrack {
  @Expose()
  protected override __type: string = 'KGChordTrack';

  constructor(id: string = 'global-chord', trackIndex: number = 3, name: string = 'Chord') {
    super(id, trackIndex, GlobalTrackType.Chord, name, []);
    this.__type = 'KGChordTrack';
  }

  public override getCurrentType(): string {
    return 'KGChordTrack';
  }
}
