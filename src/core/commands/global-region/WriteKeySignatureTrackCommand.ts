import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import type { KeySignature } from '../../KGProject';
import { GlobalTrackType } from '../../global-track';
import { KGKeySignatureRegion } from '../../region/KGKeySignatureRegion';
import {
  cloneKeySignatureRegions,
  findGlobalTrackByType,
  getSongEndBar,
  getSortedKeySignatureRegions,
} from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface WriteKeySignatureEntry {
  startTick: number;
  keySignature: KeySignature;
}

function cloneRegions(regions: KGKeySignatureRegion[], ticksPerBar: number): KGKeySignatureRegion[] {
  return cloneKeySignatureRegions(regions, ticksPerBar);
}

export class WriteKeySignatureTrackCommand extends KGCommand {
  private readonly baseKeySignature: KeySignature;
  private readonly replacements: WriteKeySignatureEntry[];
  private previousRegions: KGKeySignatureRegion[] | null = null;
  private nextRegions: KGKeySignatureRegion[] | null = null;

  constructor(baseKeySignature: KeySignature, replacements: WriteKeySignatureEntry[]) {
    super();
    this.baseKeySignature = baseKeySignature;
    this.replacements = replacements.map(replacement => ({
      startTick: replacement.startTick,
      keySignature: replacement.keySignature,
    }));
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found');
    }

    if (this.nextRegions) {
      track.setRegions(cloneRegions(this.nextRegions, ticksPerBar));
      return;
    }

    const currentRegions = getSortedKeySignatureRegions(track, ticksPerBar);
    this.previousRegions = cloneRegions(currentRegions, ticksPerBar);

    const songEndBar = getSongEndBar(project);
    if (songEndBar <= 0) {
      this.nextRegions = [];
      track.setRegions([]);
      return;
    }

    const normalizedReplacements = this.replacements
      .map(replacement => ({
        startBar: Math.floor(replacement.startTick / ticksPerBar),
        keySignature: replacement.keySignature,
      }))
      .sort((left, right) => left.startBar - right.startBar);

    const nextRegions: KGKeySignatureRegion[] = [];
    let currentStartBar = 0;
    let currentKeySignature = this.baseKeySignature;

    for (const replacement of normalizedReplacements) {
      if (replacement.startBar > currentStartBar) {
        nextRegions.push(new KGKeySignatureRegion(
          generateUniqueId('KGKeySignatureRegion'),
          track.getId(),
          track.getTrackIndex(),
          currentKeySignature,
          currentStartBar,
          replacement.startBar - currentStartBar,
          ticksPerBar,
        ));
      }

      currentStartBar = replacement.startBar;
      currentKeySignature = replacement.keySignature;
    }

    if (currentStartBar < songEndBar) {
      nextRegions.push(new KGKeySignatureRegion(
        generateUniqueId('KGKeySignatureRegion'),
        track.getId(),
        track.getTrackIndex(),
        currentKeySignature,
        currentStartBar,
        songEndBar - currentStartBar,
        ticksPerBar,
      ));
    }

    this.nextRegions = nextRegions;
    track.setRegions(cloneRegions(this.nextRegions, ticksPerBar));
  }

  undo(): void {
    if (!this.previousRegions) {
      throw new Error('Cannot undo key signature write without original regions');
    }

    const project = KGCore.instance().getCurrentProject();
    const projectTimeSignature = project.getTimeSignature();
  const ticksPerBar = projectTimeSignature.numerator * 960 * (4 / projectTimeSignature.denominator);
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found during undo');
    }

    track.setRegions(cloneRegions(this.previousRegions, ticksPerBar));
  }

  getDescription(): string {
    return 'Write key signature track';
  }
}
