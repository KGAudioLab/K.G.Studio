import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGGlobalRegion } from '../../region/KGGlobalRegion';
import { GlobalTrackType } from '../../global-track';
import { findGlobalTrackContainingRegion, findNonOverlappingNeighborBounds } from '../../../util/globalTrackUtil';

export class MoveGlobalRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly desiredStartTick: number;
  private targetRegion: KGGlobalRegion | null = null;
  private originalStartTick = 0;

  constructor(regionId: string, desiredStartTick: number) {
    super();
    this.regionId = regionId;
    this.desiredStartTick = desiredStartTick;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const result = findGlobalTrackContainingRegion(project, this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found`);
    }

    this.targetRegion = result.region;
    this.originalStartTick = result.region.getStartTick();

    if (result.track.getType() !== GlobalTrackType.Marker && result.track.getType() !== GlobalTrackType.Chord) {
      result.region.setStartTick(this.desiredStartTick);
      return;
    }

    const { minStartTick, maxEndTick } = findNonOverlappingNeighborBounds(
      project,
      result.track.getType() as GlobalTrackType.Marker | GlobalTrackType.Chord,
      this.regionId,
      this.desiredStartTick
    );
    const maxStartTick = Math.max(minStartTick, maxEndTick - result.region.getLengthTicks());
    const clampedStartTick = Math.max(minStartTick, Math.min(this.desiredStartTick, maxStartTick));
    result.region.setStartTick(clampedStartTick);

    result.track.setRegions([...result.track.getRegions()].sort((left, right) => left.getStartTick() - right.getStartTick()));
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no global region was moved');
    }

    this.targetRegion.setStartTick(this.originalStartTick);
  }

  getDescription(): string {
    return `Move global region "${this.targetRegion?.getName() ?? this.regionId}"`;
  }
}
