import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { findGlobalTrackContainingRegion } from '../../../util/globalTrackUtil';
import { KGChordRegion } from '../../region/KGChordRegion';

export class UpdateChordRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextSymbol: string;
  private previousSymbol: string | null = null;

  constructor(regionId: string, nextSymbol: string) {
    super();
    this.regionId = regionId;
    this.nextSymbol = nextSymbol;
  }

  execute(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result || !(result.region instanceof KGChordRegion)) {
      throw new Error(`Chord region with ID ${this.regionId} not found`);
    }

    this.previousSymbol = result.region.getSymbol();
    result.region.setSymbol(this.nextSymbol);
  }

  undo(): void {
    const result = findGlobalTrackContainingRegion(KGCore.instance().getCurrentProject(), this.regionId);
    if (!result || !(result.region instanceof KGChordRegion) || this.previousSymbol === null) {
      throw new Error(`Chord region with ID ${this.regionId} not found during undo`);
    }

    result.region.setSymbol(this.previousSymbol);
  }

  getDescription(): string {
    return `Change chord to "${this.nextSymbol}"`;
  }
}
