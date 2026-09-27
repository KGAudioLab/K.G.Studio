import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { findGlobalTrackByType } from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface WriteChordProgressionEntry {
  startTick: number;
  length: number;
  symbol: string;
}

function cloneChordRegion(region: KGChordRegion): KGChordRegion {
  return new KGChordRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getSymbol(),
    region.getStartTick(),
    region.getLengthTicks(),
  );
}

function cloneChordRegions(regions: KGChordRegion[]): KGChordRegion[] {
  return regions.map(cloneChordRegion);
}

export class WriteChordProgressionCommand extends KGCommand {
  private readonly replacements: WriteChordProgressionEntry[];
  private originalRegions: KGChordRegion[] | null = null;
  private nextRegions: KGChordRegion[] | null = null;

  constructor(replacements: WriteChordProgressionEntry[]) {
    super();
    this.replacements = replacements.map(replacement => ({
      startTick: replacement.startTick,
      length: replacement.length,
      symbol: replacement.symbol,
    }));
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found');
    }

    if (this.nextRegions) {
      chordTrack.setRegions(cloneChordRegions(this.nextRegions));
      return;
    }

    const currentRegions = chordTrack.getRegions()
      .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
      .sort((left, right) => left.getStartTick() - right.getStartTick());

    const sortedReplacements = [...this.replacements].sort((left, right) => left.startTick - right.startTick);
    this.originalRegions = cloneChordRegions(currentRegions);

    const preservedRegions: KGChordRegion[] = [];
    for (const region of currentRegions) {
      const regionStart = region.getStartTick();
      const regionEnd = regionStart + region.getLengthTicks();
      const overlappingReplacements = sortedReplacements.filter(replacement => (
        replacement.startTick < regionEnd
        && replacement.startTick + replacement.length > regionStart
      ));

      if (overlappingReplacements.length === 0) {
        preservedRegions.push(cloneChordRegion(region));
        continue;
      }

      let cursor: number = regionStart;
      let fragmentIndex = 0;
      for (const replacement of overlappingReplacements) {
        const replacementStart = Math.max(regionStart, replacement.startTick);
        const replacementEnd = Math.min(regionEnd, replacement.startTick + replacement.length);
        if (replacementStart > cursor) {
          preservedRegions.push(new KGChordRegion(
            fragmentIndex === 0 ? region.getId() : generateUniqueId('KGChordRegion'),
            region.getTrackId(),
            region.getTrackIndex(),
            region.getSymbol(),
            cursor,
            replacementStart - cursor,
          ));
          fragmentIndex += 1;
        }
        cursor = Math.max(cursor, replacementEnd);
      }

      if (cursor < regionEnd) {
        preservedRegions.push(new KGChordRegion(
          fragmentIndex === 0 ? region.getId() : generateUniqueId('KGChordRegion'),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getSymbol(),
          cursor,
          regionEnd - cursor,
        ));
      }
    }

    const replacementRegions = sortedReplacements.map(replacement => new KGChordRegion(
      generateUniqueId('KGChordRegion'),
      chordTrack.getId(),
      chordTrack.getTrackIndex(),
      replacement.symbol,
      replacement.startTick,
      replacement.length,
    ));

    this.nextRegions = [...preservedRegions, ...replacementRegions]
      .sort((left, right) => left.getStartTick() - right.getStartTick());

    chordTrack.setRegions(cloneChordRegions(this.nextRegions));
  }

  undo(): void {
    if (!this.originalRegions) {
      throw new Error('Cannot undo chord progression write without original regions');
    }

    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found during undo');
    }

    chordTrack.setRegions(cloneChordRegions(this.originalRegions));
  }

  getDescription(): string {
    return 'Write chord progression';
  }
}
