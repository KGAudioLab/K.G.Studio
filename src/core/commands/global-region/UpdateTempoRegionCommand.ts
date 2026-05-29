import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import { findGlobalTrackByType } from '../../../util/globalTrackUtil';

export class UpdateTempoRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextBpm: number;
  private previousBpm: number | null = null;
  private targetRegion: KGTempoRegion | null = null;

  constructor(regionId: string, nextBpm: number) {
    super();
    this.regionId = regionId;
    this.nextBpm = nextBpm;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    const region = track.getRegions().find(candidate => candidate.getId() === this.regionId);
    if (!(region instanceof KGTempoRegion)) {
      throw new Error(`Tempo region with ID ${this.regionId} not found`);
    }

    this.targetRegion = region;
    this.previousBpm = region.getBpm();
    region.setBpm(this.nextBpm);
  }

  undo(): void {
    if (!this.targetRegion || this.previousBpm === null) {
      throw new Error('Cannot undo tempo update without previous state');
    }

    this.targetRegion.setBpm(this.previousBpm);
  }

  getDescription(): string {
    return `Change tempo to "${this.nextBpm} BPM"`;
  }
}
