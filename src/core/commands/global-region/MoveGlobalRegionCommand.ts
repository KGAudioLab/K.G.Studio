import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGGlobalRegion } from '../../region/KGGlobalRegion';
import { GlobalTrackType } from '../../global-track';
import { findGlobalTrackContainingRegion, findNonOverlappingNeighborBounds } from '../../../util/globalTrackUtil';

export class MoveGlobalRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly desiredStartBeat: number;
  private targetRegion: KGGlobalRegion | null = null;
  private originalStartBeat = 0;

  constructor(regionId: string, desiredStartBeat: number) {
    super();
    this.regionId = regionId;
    this.desiredStartBeat = desiredStartBeat;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const result = findGlobalTrackContainingRegion(project, this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found`);
    }

    this.targetRegion = result.region;
    this.originalStartBeat = result.region.getStartFromBeat();

    if (result.track.getType() !== GlobalTrackType.Marker && result.track.getType() !== GlobalTrackType.Chord) {
      result.region.setStartFromBeat(this.desiredStartBeat);
      return;
    }

    const { minStartBeat, maxEndBeat } = findNonOverlappingNeighborBounds(
      project,
      result.track.getType() as GlobalTrackType.Marker | GlobalTrackType.Chord,
      this.regionId,
      this.desiredStartBeat
    );
    const maxStartBeat = Math.max(minStartBeat, maxEndBeat - result.region.getLength());
    const clampedStartBeat = Math.max(minStartBeat, Math.min(this.desiredStartBeat, maxStartBeat));
    result.region.setStartFromBeat(clampedStartBeat);

    result.track.setRegions([...result.track.getRegions()].sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat()));
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no global region was moved');
    }

    this.targetRegion.setStartFromBeat(this.originalStartBeat);
  }

  getDescription(): string {
    return `Move global region "${this.targetRegion?.getName() ?? this.regionId}"`;
  }
}
