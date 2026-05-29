import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import type { GlobalRegionResizeEdge } from './ResizeGlobalRegionCommand';
import {
  cloneKeySignatureRegions,
  findGlobalTrackByType,
  getSortedKeySignatureRegions,
} from '../../../util/globalTrackUtil';

export class ResizeKeySignatureRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly edge: GlobalRegionResizeEdge;
  private readonly desiredBar: number;
  private previousRegions: KGKeySignatureRegion[] = [];

  constructor(regionId: string, edge: GlobalRegionResizeEdge, desiredBar: number) {
    super();
    this.regionId = regionId;
    this.edge = edge;
    this.desiredBar = desiredBar;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found');
    }

    const regions = getSortedKeySignatureRegions(track, beatsPerBar);
    this.previousRegions = cloneKeySignatureRegions(regions, beatsPerBar);

    const targetIndex = regions.findIndex(region => region.getId() === this.regionId);
    if (targetIndex === -1) {
      throw new Error(`Key signature region with ID ${this.regionId} not found`);
    }

    const targetRegion = regions[targetIndex];
    if (this.edge === 'start') {
      if (targetIndex === 0) {
        return;
      }

      const previousRegion = regions[targetIndex - 1];
      const targetEndBar = targetRegion.getEndBar();
      const clampedBoundaryBar = Math.max(
        previousRegion.getStartBar() + 1,
        Math.min(this.desiredBar, targetEndBar - 1)
      );

      previousRegion.setLengthBars(clampedBoundaryBar - previousRegion.getStartBar(), beatsPerBar);
      targetRegion.setBarRange(clampedBoundaryBar, targetEndBar - clampedBoundaryBar, beatsPerBar);
      return;
    }

    if (targetIndex === regions.length - 1) {
      return;
    }

    const nextRegion = regions[targetIndex + 1];
    const nextRegionEndBar = nextRegion.getEndBar();
    const clampedBoundaryBar = Math.max(
      targetRegion.getStartBar() + 1,
      Math.min(this.desiredBar, nextRegionEndBar - 1)
    );

    targetRegion.setLengthBars(clampedBoundaryBar - targetRegion.getStartBar(), beatsPerBar);
    nextRegion.setBarRange(clampedBoundaryBar, nextRegionEndBar - clampedBoundaryBar, beatsPerBar);
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found during undo');
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    track.setRegions(cloneKeySignatureRegions(this.previousRegions, beatsPerBar));
  }

  getDescription(): string {
    return `Resize key signature boundary for "${this.regionId}"`;
  }
}
