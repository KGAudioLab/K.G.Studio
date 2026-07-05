import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import {
  findGlobalTrackByType,
  getRequiredMaxBarsForAudioRegions,
  normalizeTempoRegionsForProject,
  restoreAudioRegionLengths,
  syncAudioRegionLengthsToPlaybackDuration,
  type AudioRegionLengthSnapshot,
} from '../../../util/globalTrackUtil';

export class UpdateTempoRegionCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextBpm: number;
  private previousBpm: number | null = null;
  private previousMaxBars: number | null = null;
  private nextMaxBars: number | null = null;
  private targetRegion: KGTempoRegion | null = null;
  private audioRegionLengthSnapshots: AudioRegionLengthSnapshot[] = [];

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
    this.previousMaxBars = project.getMaxBars();
    region.setBpm(this.nextBpm);
    this.audioRegionLengthSnapshots = syncAudioRegionLengthsToPlaybackDuration(project);

    const requiredMaxBars = getRequiredMaxBarsForAudioRegions(project);
    this.nextMaxBars = Math.max(project.getMaxBars(), requiredMaxBars);
    if (this.nextMaxBars > project.getMaxBars()) {
      project.setMaxBars(this.nextMaxBars);
      normalizeTempoRegionsForProject(project);
    }
  }

  undo(): void {
    if (!this.targetRegion || this.previousBpm === null || this.previousMaxBars === null) {
      throw new Error('Cannot undo tempo update without previous state');
    }

    const project = KGCore.instance().getCurrentProject();
    this.targetRegion.setBpm(this.previousBpm);
    if (project.getMaxBars() !== this.previousMaxBars) {
      project.setMaxBars(this.previousMaxBars);
      normalizeTempoRegionsForProject(project);
    }
    if (this.audioRegionLengthSnapshots.length > 0) {
      restoreAudioRegionLengths(this.audioRegionLengthSnapshots);
    }
  }

  getDescription(): string {
    return `Change tempo to "${this.nextBpm} BPM"`;
  }
}
