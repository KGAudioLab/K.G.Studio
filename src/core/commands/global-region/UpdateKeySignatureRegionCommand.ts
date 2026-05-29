import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import type { KeySignature } from '../../KGProject';
import { findGlobalTrackContainingRegion } from '../../../util/globalTrackUtil';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';

export class UpdateKeySignatureRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextKeySignature: KeySignature;
  private previousKeySignature: KeySignature | null = null;

  constructor(regionId: string, nextKeySignature: KeySignature) {
    super();
    this.regionId = regionId;
    this.nextKeySignature = nextKeySignature;
  }

  execute(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result || !(result.region instanceof KGKeySignatureRegion)) {
      throw new Error(`Key signature region with ID ${this.regionId} not found`);
    }

    this.previousKeySignature = result.region.getKeySignature();
    result.region.setKeySignature(this.nextKeySignature);
  }

  undo(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result || !(result.region instanceof KGKeySignatureRegion) || !this.previousKeySignature) {
      throw new Error(`Key signature region with ID ${this.regionId} not found during undo`);
    }

    result.region.setKeySignature(this.previousKeySignature);
  }

  getDescription(): string {
    return `Change key signature to "${this.nextKeySignature}"`;
  }
}
