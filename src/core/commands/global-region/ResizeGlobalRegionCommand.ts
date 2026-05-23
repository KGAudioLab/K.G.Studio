import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { findGlobalTrackContainingRegion, findMarkerNeighborBounds, getSongEndBeat } from '../../../util/globalTrackUtil';
import { KGGlobalRegion } from '../../region/KGGlobalRegion';

export type GlobalRegionResizeEdge = 'start' | 'end';

export class ResizeGlobalRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly edge: GlobalRegionResizeEdge;
  private readonly desiredBeat: number;
  private targetRegion: KGGlobalRegion | null = null;
  private originalStartBeat = 0;
  private originalLength = 0;

  constructor(regionId: string, edge: GlobalRegionResizeEdge, desiredBeat: number) {
    super();
    this.regionId = regionId;
    this.edge = edge;
    this.desiredBeat = desiredBeat;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const result = findGlobalTrackContainingRegion(project, this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found`);
    }

    this.targetRegion = result.region;
    this.originalStartBeat = result.region.getStartFromBeat();
    this.originalLength = result.region.getLength();

    if (result.track.getType() !== GlobalTrackType.Marker) {
      return;
    }

    const originalEndBeat = this.originalStartBeat + this.originalLength;
    const { minStartBeat, maxEndBeat } = findMarkerNeighborBounds(project, this.regionId, this.originalStartBeat);
    const songEndBeat = getSongEndBeat(project);
    const absoluteMaxEndBeat = Math.min(maxEndBeat, songEndBeat);

    if (this.edge === 'start') {
      const clampedStartBeat = Math.max(minStartBeat, Math.min(this.desiredBeat, originalEndBeat - 1));
      result.region.setStartFromBeat(clampedStartBeat);
      result.region.setLength(Math.max(1, originalEndBeat - clampedStartBeat));
      return;
    }

    const clampedEndBeat = Math.max(this.originalStartBeat + 1, Math.min(this.desiredBeat, absoluteMaxEndBeat));
    result.region.setLength(Math.max(1, clampedEndBeat - this.originalStartBeat));
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no global region was resized');
    }

    this.targetRegion.setStartFromBeat(this.originalStartBeat);
    this.targetRegion.setLength(this.originalLength);
  }

  getDescription(): string {
    return `Resize global region "${this.targetRegion?.getName() ?? this.regionId}"`;
  }
}
