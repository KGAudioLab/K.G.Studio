import { Expose } from 'class-transformer';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGMarkerRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGMarkerRegion';

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    name: string,
    startFromBeat: number = 0,
    length: number = 0
  ) {
    super(id, trackId, trackIndex, name, startFromBeat, length);
    this.__type = 'KGMarkerRegion';
  }

  public override getCurrentType(): string {
    return 'KGMarkerRegion';
  }
}
