import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import {
  cloneTempoRegions,
  findGlobalTrackByType,
  findTempoRegionAtBar,
  getEffectiveBpmAtBar,
  getSongEndBar,
  getSortedTempoRegions,
} from '../../../util/globalTrackUtil';

export class CreateTempoRegionCommand extends KGCommand {
  private readonly startBar: number;
  private readonly regionId: string;
  private createdRegion: KGTempoRegion | null = null;
  private previousRegions: KGTempoRegion[] = [];

  constructor(startBar: number, regionId?: string) {
    super();
    this.startBar = startBar;
    this.regionId = regionId ?? generateUniqueId('KGTempoRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    const existingRegions = getSortedTempoRegions(track, beatsPerBar);
    this.previousRegions = cloneTempoRegions(existingRegions, beatsPerBar);

    const songEndBar = getSongEndBar(project);
    const clampedStartBar = Math.max(0, Math.min(this.startBar, Math.max(0, songEndBar - 1)));

    if (existingRegions.length === 0) {
      this.createdRegion = new KGTempoRegion(
        this.regionId,
        track.getId(),
        track.getTrackIndex(),
        getEffectiveBpmAtBar(project, clampedStartBar),
        0,
        Math.max(1, songEndBar),
        beatsPerBar
      );
      track.setRegions([this.createdRegion]);
      return;
    }

    const containingRegion = findTempoRegionAtBar(project, clampedStartBar);
    if (!containingRegion) {
      throw new Error(`No tempo region covers bar ${clampedStartBar}`);
    }

    const regionStartBar = containingRegion.getStartBar();
    const regionEndBar = containingRegion.getEndBar();
    if (clampedStartBar <= regionStartBar || clampedStartBar >= regionEndBar) {
      throw new Error(`Bar ${clampedStartBar} is not a valid split point`);
    }

    containingRegion.setLengthBars(clampedStartBar - regionStartBar, beatsPerBar);
    this.createdRegion = new KGTempoRegion(
      this.regionId,
      track.getId(),
      track.getTrackIndex(),
      containingRegion.getBpm(),
      clampedStartBar,
      regionEndBar - clampedStartBar,
      beatsPerBar
    );
    track.setRegions([...existingRegions, this.createdRegion].sort((left, right) => left.getStartBar() - right.getStartBar()));
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
    return `Create tempo change at bar ${this.startBar + 1}`;
  }

  public getCreatedRegion(): KGTempoRegion | null {
    return this.createdRegion;
  }
}
