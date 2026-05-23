import { Expose } from 'class-transformer';
import { GlobalTrackType, KGGlobalTrack } from './KGGlobalTrack';

export class KGSignatureTrack extends KGGlobalTrack {
  @Expose()
  protected override __type: string = 'KGSignatureTrack';

  constructor(id: string = 'global-signature', trackIndex: number = 2, name: string = 'Key Signature') {
    super(id, trackIndex, GlobalTrackType.Signature, name, []);
    this.__type = 'KGSignatureTrack';
  }

  public override getCurrentType(): string {
    return 'KGSignatureTrack';
  }
}
