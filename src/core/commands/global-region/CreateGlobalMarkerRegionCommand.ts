import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMarkerRegion } from '../../region/KGMarkerRegion';
import { GlobalTrackType } from '../../global-track';
import { generateUniqueId } from '../../../util/miscUtil';
import {
  DEFAULT_MARKER_REGION_NAME,
  findGlobalTrackByType,
  findMarkerNeighborBounds,
  getSongEndBeat,
} from '../../../util/globalTrackUtil';

export class CreateGlobalMarkerRegionCommand extends KGCommand {
  private readonly startBeat: number;
  private readonly preferredLength: number;
  private readonly regionId: string;
  private readonly initialName: string;
  private createdRegion: KGMarkerRegion | null = null;
  private originalRegionIndex = -1;

  constructor(startBeat: number, preferredLength: number, initialName: string = DEFAULT_MARKER_REGION_NAME, regionId?: string) {
    super();
    this.startBeat = startBeat;
    this.preferredLength = preferredLength;
    this.initialName = initialName;
    this.regionId = regionId ?? generateUniqueId('KGMarkerRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
    if (!markerTrack) {
      throw new Error('Marker global track not found');
    }

    const { maxEndBeat } = findMarkerNeighborBounds(project, null, this.startBeat);
    const songEndBeat = getSongEndBeat(project);
    const allowedEndBeat = Math.min(maxEndBeat, songEndBeat);
    const targetEndBeat = Math.min(this.startBeat + this.preferredLength, allowedEndBeat);
    const length = Math.max(1, targetEndBeat - this.startBeat);

    this.createdRegion = new KGMarkerRegion(
      this.regionId,
      markerTrack.getId(),
      markerTrack.getTrackIndex(),
      this.initialName,
      this.startBeat,
      length
    );

    const regions = [...markerTrack.getRegions(), this.createdRegion]
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());
    this.originalRegionIndex = regions.findIndex(region => region.getId() === this.regionId);
    markerTrack.setRegions(regions);
  }

  undo(): void {
    if (!this.createdRegion) {
      throw new Error('Cannot undo: no global marker region was created');
    }

    const project = KGCore.instance().getCurrentProject();
    const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
    if (!markerTrack) {
      throw new Error('Marker global track not found during undo');
    }

    markerTrack.removeRegion(this.regionId);
  }

  getDescription(): string {
    return `Create marker "${this.initialName}"`;
  }

  public getCreatedRegion(): KGMarkerRegion | null {
    return this.createdRegion;
  }
}
