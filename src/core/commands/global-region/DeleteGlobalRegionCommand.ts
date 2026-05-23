import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGGlobalRegion } from '../../region/KGGlobalRegion';
import { findGlobalTrackContainingRegion } from '../../../util/globalTrackUtil';

export class DeleteGlobalRegionCommand extends KGCommand {
  private readonly regionId: string;
  private deletedRegion: KGGlobalRegion | null = null;
  private trackId: string | null = null;
  private originalIndex = -1;

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const result = findGlobalTrackContainingRegion(project, this.regionId);
    if (!result) {
      throw new Error(`Global region with ID ${this.regionId} not found`);
    }

    this.deletedRegion = result.region;
    this.trackId = result.track.getId();
    this.originalIndex = result.regionIndex;
    result.track.removeRegion(this.regionId);

    const selectedItem = KGCore.instance().getSelectedItems().find(item => item.getId() === this.regionId);
    if (selectedItem) {
      KGCore.instance().removeSelectedItem(selectedItem);
    }
  }

  undo(): void {
    if (!this.deletedRegion || !this.trackId) {
      throw new Error('Cannot undo: no deleted global region stored');
    }

    const project = KGCore.instance().getCurrentProject();
    const track = project.getGlobalTracks().find(candidate => candidate.getId() === this.trackId);
    if (!track) {
      throw new Error(`Global track ${this.trackId} not found during undo`);
    }

    const regions = [...track.getRegions()];
    regions.splice(this.originalIndex, 0, this.deletedRegion);
    track.setRegions(regions);
  }

  getDescription(): string {
    return `Delete marker "${this.deletedRegion?.getName() ?? this.regionId}"`;
  }
}

export class DeleteMultipleGlobalRegionsCommand extends KGCommand {
  private readonly regionIds: string[];
  private deletedRegions: Array<{ region: KGGlobalRegion; trackId: string; originalIndex: number }> = [];

  constructor(regionIds: string[]) {
    super();
    this.regionIds = regionIds;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    this.deletedRegions = [];

    for (const regionId of this.regionIds) {
      const result = findGlobalTrackContainingRegion(project, regionId);
      if (!result) continue;
      this.deletedRegions.push({
        region: result.region,
        trackId: result.track.getId(),
        originalIndex: result.regionIndex,
      });
    }

    this.deletedRegions
      .slice()
      .sort((left, right) => right.originalIndex - left.originalIndex)
      .forEach(({ region, trackId }) => {
        const track = project.getGlobalTracks().find(candidate => candidate.getId() === trackId);
        track?.removeRegion(region.getId());
        const selectedItem = KGCore.instance().getSelectedItems().find(item => item.getId() === region.getId());
        if (selectedItem) {
          KGCore.instance().removeSelectedItem(selectedItem);
        }
      });
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    this.deletedRegions
      .slice()
      .sort((left, right) => left.originalIndex - right.originalIndex)
      .forEach(({ region, trackId, originalIndex }) => {
        const track = project.getGlobalTracks().find(candidate => candidate.getId() === trackId);
        if (!track) return;
        const regions = [...track.getRegions()];
        regions.splice(originalIndex, 0, region);
        track.setRegions(regions);
      });
  }

  getDescription(): string {
    return this.regionIds.length === 1 ? 'Delete marker' : `Delete ${this.regionIds.length} markers`;
  }
}
