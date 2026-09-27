import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { findGlobalTrackContainingRegion, findNonOverlappingNeighborBounds, getSongEndTick } from '../../../util/globalTrackUtil';
import { KGGlobalRegion } from '../../region/KGGlobalRegion';

export type GlobalRegionResizeEdge = 'start' | 'end';

export class ResizeGlobalRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly edge: GlobalRegionResizeEdge;
  private readonly desiredBeat: number;
  private targetRegion: KGGlobalRegion | null = null;
  private originalStartTick = 0;
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
    this.originalStartTick = result.region.getStartTick();
    this.originalLength = result.region.getLengthTicks();

    if (result.track.getType() !== GlobalTrackType.Marker && result.track.getType() !== GlobalTrackType.Chord) {
      return;
    }

    const originalEndTick = this.originalStartTick + this.originalLength;
    const { minStartTick, maxEndTick } = findNonOverlappingNeighborBounds(
      project,
      result.track.getType() as GlobalTrackType.Marker | GlobalTrackType.Chord,
      this.regionId,
      this.originalStartTick
    );
    const songEndTick = getSongEndTick(project);
    const absoluteMaxEndTick = Math.min(maxEndTick, songEndTick);

    if (this.edge === 'start') {
      const clampedStartTick = Math.max(minStartTick, Math.min(this.desiredBeat, originalEndTick - 1));
      result.region.setStartTick(clampedStartTick);
      result.region.setLengthTicks(Math.max(1, originalEndTick - clampedStartTick));
      return;
    }

    const clampedEndTick = Math.max(this.originalStartTick + 1, Math.min(this.desiredBeat, absoluteMaxEndTick));
    result.region.setLengthTicks(Math.max(1, clampedEndTick - this.originalStartTick));
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no global region was resized');
    }

    this.targetRegion.setStartTick(this.originalStartTick);
    this.targetRegion.setLengthTicks(this.originalLength);
  }

  getDescription(): string {
    return `Resize global region "${this.targetRegion?.getName() ?? this.regionId}"`;
  }
}
