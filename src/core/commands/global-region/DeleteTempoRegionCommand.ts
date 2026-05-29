import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import {
  cloneTempoRegions,
  findGlobalTrackByType,
  getSortedTempoRegions,
} from '../../../util/globalTrackUtil';

export class DeleteTempoRegionCommand extends KGCommand {
  private readonly regionId: string;
  private previousRegions: KGTempoRegion[] = [];
  private deletedBpm = '';

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    const regions = getSortedTempoRegions(track, beatsPerBar);
    this.previousRegions = cloneTempoRegions(regions, beatsPerBar);

    const targetIndex = regions.findIndex(region => region.getId() === this.regionId);
    if (targetIndex === -1) {
      throw new Error(`Tempo region with ID ${this.regionId} not found`);
    }

    const targetRegion = regions[targetIndex];
    this.deletedBpm = `${targetRegion.getBpm()} BPM`;

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
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found during undo');
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    track.setRegions(cloneTempoRegions(this.previousRegions, beatsPerBar));
  }

  getDescription(): string {
    return `Delete tempo "${this.deletedBpm || this.regionId}"`;
  }
}

export class DeleteMultipleTempoRegionsCommand extends KGCommand {
  private readonly regionIds: string[];
  private previousRegions: KGTempoRegion[] = [];

  constructor(regionIds: string[]) {
    super();
    this.regionIds = regionIds;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    const regions = getSortedTempoRegions(track, beatsPerBar);
    this.previousRegions = cloneTempoRegions(regions, beatsPerBar);

    let workingRegions = cloneTempoRegions(regions, beatsPerBar);

    for (const regionId of this.regionIds) {
      const targetIndex = workingRegions.findIndex(region => region.getId() === regionId);
      if (targetIndex === -1) {
        continue;
      }

      const deletedRegion = workingRegions[targetIndex];
      const deletedLengthBars = deletedRegion.getLengthBars();

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
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found during undo');
    }

    const beatsPerBar = project.getTimeSignature().numerator;
    track.setRegions(cloneTempoRegions(this.previousRegions, beatsPerBar));
  }

  getDescription(): string {
    return this.regionIds.length === 1 ? 'Delete tempo change' : `Delete ${this.regionIds.length} tempo changes`;
  }
}
