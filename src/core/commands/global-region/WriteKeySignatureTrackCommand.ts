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
  startBeat: number;
  keySignature: KeySignature;
}

function cloneRegions(regions: KGKeySignatureRegion[], beatsPerBar: number): KGKeySignatureRegion[] {
  return cloneKeySignatureRegions(regions, beatsPerBar);
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
      startBeat: replacement.startBeat,
      keySignature: replacement.keySignature,
    }));
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found');
    }

    if (this.nextRegions) {
      track.setRegions(cloneRegions(this.nextRegions, beatsPerBar));
      return;
    }

    const currentRegions = getSortedKeySignatureRegions(track, beatsPerBar);
    this.previousRegions = cloneRegions(currentRegions, beatsPerBar);

    const songEndBar = getSongEndBar(project);
    if (songEndBar <= 0) {
      this.nextRegions = [];
      track.setRegions([]);
      return;
    }

    const normalizedReplacements = this.replacements
      .map(replacement => ({
        startBar: Math.floor(replacement.startBeat / beatsPerBar),
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
          beatsPerBar,
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
        beatsPerBar,
      ));
    }

    this.nextRegions = nextRegions;
    track.setRegions(cloneRegions(this.nextRegions, beatsPerBar));
  }

  undo(): void {
    if (!this.previousRegions) {
      throw new Error('Cannot undo key signature write without original regions');
    }

    const project = KGCore.instance().getCurrentProject();
    const beatsPerBar = project.getTimeSignature().numerator;
    const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
    if (!track) {
      throw new Error('Signature global track not found during undo');
    }

    track.setRegions(cloneRegions(this.previousRegions, beatsPerBar));
  }

  getDescription(): string {
    return 'Write key signature track';
  }
}
