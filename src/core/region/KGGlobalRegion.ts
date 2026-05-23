import { Expose } from 'class-transformer';
import { KGRegion } from './KGRegion';

export class KGGlobalRegion extends KGRegion {
  @Expose()
  protected override __type: string = 'KGGlobalRegion';

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    name: string,
    startFromBeat: number = 0,
    length: number = 0
  ) {
    super(id, trackId, trackIndex, name, startFromBeat, length);
    this.__type = 'KGGlobalRegion';
  }

  public override getRootType(): string {
    return 'KGRegion';
  }

  public override getCurrentType(): string {
    return 'KGGlobalRegion';
  }
}
