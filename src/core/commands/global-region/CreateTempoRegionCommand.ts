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
    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found');
    }

    const existingRegions = getSortedTempoRegions(track, ticksPerBar);
    this.previousRegions = cloneTempoRegions(existingRegions, ticksPerBar);

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
        ticksPerBar
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

    containingRegion.setLengthBars(clampedStartBar - regionStartBar, ticksPerBar);
    this.createdRegion = new KGTempoRegion(
      this.regionId,
      track.getId(),
      track.getTrackIndex(),
      containingRegion.getBpm(),
      clampedStartBar,
      regionEndBar - clampedStartBar,
      ticksPerBar
    );
    track.setRegions([...existingRegions, this.createdRegion].sort((left, right) => left.getStartBar() - right.getStartBar()));
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!track) {
      throw new Error('Tempo global track not found during undo');
    }

    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    track.setRegions(cloneTempoRegions(this.previousRegions, ticksPerBar));
  }

  getDescription(): string {
    return `Create tempo change at bar ${this.startBar + 1}`;
  }

  public getCreatedRegion(): KGTempoRegion | null {
    return this.createdRegion;
  }
}
