import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { findGlobalTrackContainingRegion } from '../../../util/globalTrackUtil';

export class UpdateGlobalRegionTextCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextText: string;
  private previousText = '';

  constructor(regionId: string, nextText: string) {
    super();
    this.regionId = regionId;
    this.nextText = nextText;
  }

  execute(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found`);
    }

    this.previousText = result.region.getName();
    result.region.setName(this.nextText);
  }

  undo(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found during undo`);
    }

    result.region.setName(this.previousText);
  }

  getDescription(): string {
    return `Rename marker to "${this.nextText}"`;
  }
}
