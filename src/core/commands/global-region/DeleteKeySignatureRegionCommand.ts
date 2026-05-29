import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import {
  cloneKeySignatureRegions,
  findGlobalTrackByType,
  getSortedKeySignatureRegions,
} from '../../../util/globalTrackUtil';

export class DeleteKeySignatureRegionCommand extends KGCommand {
  private readonly regionId: string;
  private previousRegions: KGKeySignatureRegion[] = [];
  private deletedKeySignature = '';

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
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
    this.deletedKeySignature = targetRegion.getKeySignature();

    if (regions.length === 1) {
      track.setRegions([]);
      return;
    }

    const nextRegions = [...regions];
    const deletedLengthBars = targetRegion.getLengthBars();

    if (targetIndex === 0) {
      const nextRegion = nextRegions[1];
      nextRegion.setBarRange(0, nextRegion.getLengthBars() + deletedLengthBars, beatsPerBar);
      nextRegions.splice(0, 1);
      track.setRegions(nextRegions);
      return;
    }

    const previousRegion = nextRegions[targetIndex - 1];
    previousRegion.setLengthBars(previousRegion.getLengthBars() + deletedLengthBars, beatsPerBar);
    nextRegions.splice(targetIndex, 1);
    track.setRegions(nextRegions);
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
    return `Delete key signature "${this.deletedKeySignature || this.regionId}"`;
  }
}

export class DeleteMultipleKeySignatureRegionsCommand extends KGCommand {
  private readonly regionIds: string[];
  private previousRegions: KGKeySignatureRegion[] = [];

  constructor(regionIds: string[]) {
    super();
    this.regionIds = regionIds;
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

    const remainingIds = new Set(this.regionIds);
    let workingRegions = cloneKeySignatureRegions(regions, beatsPerBar);

    for (const regionId of this.regionIds) {
      const targetIndex = workingRegions.findIndex(region => region.getId() === regionId);
      if (targetIndex === -1) {
        continue;
      }

      const deletedRegion = workingRegions[targetIndex];
      const deletedLengthBars = deletedRegion.getLengthBars();
      remainingIds.delete(regionId);

      if (workingRegions.length === 1) {
        workingRegions = [];
        continue;
      }

      if (targetIndex === 0) {
        const nextRegion = workingRegions[1];
        nextRegion.setBarRange(0, nextRegion.getLengthBars() + deletedLengthBars, beatsPerBar);
        workingRegions.splice(0, 1);
        continue;
      }

      const previousRegion = workingRegions[targetIndex - 1];
      previousRegion.setLengthBars(previousRegion.getLengthBars() + deletedLengthBars, beatsPerBar);
      workingRegions.splice(targetIndex, 1);
    }

    track.setRegions(workingRegions);
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
    return this.regionIds.length === 1 ? 'Delete key signature' : `Delete ${this.regionIds.length} key signatures`;
  }
}
