import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import type { KeySignature } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import {
  cloneKeySignatureRegions,
  findGlobalTrackByType,
  findKeySignatureRegionAtBar,
  getSongEndBar,
  getSortedKeySignatureRegions,
} from '../../../util/globalTrackUtil';

export class CreateKeySignatureRegionCommand extends KGCommand {
  private readonly startBar: number;
  private readonly regionId: string;
  private createdRegion: KGKeySignatureRegion | null = null;
  private previousRegions: KGKeySignatureRegion[] = [];

  constructor(startBar: number, regionId?: string) {
    super();
    this.startBar = startBar;
    this.regionId = regionId ?? generateUniqueId('KGKeySignatureRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found');
    }

    const existingRegions = getSortedKeySignatureRegions(track, ticksPerBar);
    this.previousRegions = cloneKeySignatureRegions(existingRegions, ticksPerBar);

    const songEndBar = getSongEndBar(project);
    const clampedStartBar = Math.max(0, Math.min(this.startBar, Math.max(0, songEndBar - 1)));

    if (existingRegions.length === 0) {
      const nextRegions: KGKeySignatureRegion[] = [];

      if (clampedStartBar > 0) {
        nextRegions.push(new KGKeySignatureRegion(
          generateUniqueId('KGKeySignatureRegion'),
          track.getId(),
          track.getTrackIndex(),
          project.getKeySignature(),
          0,
          clampedStartBar,
          ticksPerBar
        ));
      }

      this.createdRegion = new KGKeySignatureRegion(
        this.regionId,
        track.getId(),
        track.getTrackIndex(),
        project.getKeySignature(),
        clampedStartBar,
        Math.max(1, songEndBar - clampedStartBar),
        ticksPerBar
      );
      nextRegions.push(this.createdRegion);
      track.setRegions(nextRegions);
      return;
    }

    const containingRegion = findKeySignatureRegionAtBar(project, clampedStartBar);
    if (!containingRegion) {
      throw new Error(`No key signature region covers bar ${clampedStartBar}`);
    }

    const regionStartBar = containingRegion.getStartBar();
    const regionEndBar = containingRegion.getEndBar();
    if (clampedStartBar <= regionStartBar || clampedStartBar >= regionEndBar) {
      throw new Error(`Bar ${clampedStartBar} is not a valid split point`);
    }

    containingRegion.setLengthBars(clampedStartBar - regionStartBar, ticksPerBar);
    this.createdRegion = new KGKeySignatureRegion(
      this.regionId,
      track.getId(),
      track.getTrackIndex(),
      containingRegion.getKeySignature(),
      clampedStartBar,
      regionEndBar - clampedStartBar,
      ticksPerBar
    );

    track.setRegions([...existingRegions, this.createdRegion].sort((left, right) => left.getStartBar() - right.getStartBar()));
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found during undo');
    }

    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    track.setRegions(cloneKeySignatureRegions(this.previousRegions, ticksPerBar));
  }

  getDescription(): string {
    return `Create key signature change at bar ${this.startBar + 1}`;
  }

  public getCreatedRegion(): KGKeySignatureRegion | null {
    return this.createdRegion;
  }
}
