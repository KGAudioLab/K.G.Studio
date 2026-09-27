import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMarkerRegion } from '../../region/KGMarkerRegion';
import { GlobalTrackType } from '../../global-track';
import { generateUniqueId } from '../../../util/miscUtil';
import {
  DEFAULT_MARKER_REGION_NAME,
  findGlobalTrackByType,
  findMarkerNeighborBounds,
  getSongEndTick,
} from '../../../util/globalTrackUtil';

export class CreateGlobalMarkerRegionCommand extends KGCommand {
  private readonly startTick: number;
  private readonly preferredLength: number;
  private readonly regionId: string;
  private readonly initialName: string;
  private createdRegion: KGMarkerRegion | null = null;
  private originalRegionIndex = -1;

  constructor(startTick: number, preferredLength: number, initialName: string = DEFAULT_MARKER_REGION_NAME, regionId?: string) {
    super();
    this.startTick = startTick;
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

    const { maxEndTick } = findMarkerNeighborBounds(project, null, this.startTick);
    const songEndTick = getSongEndTick(project);
    const allowedEndTick = Math.min(maxEndTick, songEndTick);
    const targetEndTick = Math.min(this.startTick + this.preferredLength, allowedEndTick);
    const length = Math.max(1, targetEndTick - this.startTick);

    this.createdRegion = new KGMarkerRegion(
      this.regionId,
      markerTrack.getId(),
      markerTrack.getTrackIndex(),
      this.initialName,
      this.startTick,
      length
    );

    const regions = [...markerTrack.getRegions(), this.createdRegion]
      .sort((left, right) => left.getStartTick() - right.getStartTick());
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
