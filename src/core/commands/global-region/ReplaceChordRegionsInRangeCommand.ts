import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { findGlobalTrackByType } from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface ChordRegionReplacementData {
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

export class ReplaceChordRegionsInRangeCommand extends KGCommand {
  private readonly rangeStartTick: number;
  private readonly rangeEndTick: number;
  private readonly replacements: ChordRegionReplacementData[];
  private originalRegions: KGChordRegion[] | null = null;
  private nextRegions: KGChordRegion[] | null = null;

  constructor(rangeStartTick: number, rangeEndTick: number, replacements: ChordRegionReplacementData[]) {
    super();
    this.rangeStartTick = Math.max(0, rangeStartTick);
    this.rangeEndTick = Math.max(this.rangeStartTick, rangeEndTick);
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

    this.originalRegions = cloneChordRegions(currentRegions);

    const preservedRegions: KGChordRegion[] = [];
    for (const region of currentRegions) {
      const regionStart = region.getStartTick();
      const regionEnd = regionStart + region.getLengthTicks();

      if (regionEnd <= this.rangeStartTick || regionStart >= this.rangeEndTick) {
        preservedRegions.push(cloneChordRegion(region));
        continue;
      }

      if (regionStart < this.rangeStartTick) {
        preservedRegions.push(new KGChordRegion(
          region.getId(),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getSymbol(),
          regionStart,
          this.rangeStartTick - regionStart,
        ));
      }

      if (regionEnd > this.rangeEndTick) {
        preservedRegions.push(new KGChordRegion(
          generateUniqueId('KGChordRegion'),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getSymbol(),
          this.rangeEndTick,
          regionEnd - this.rangeEndTick,
        ));
      }
    }

    const replacementRegions = this.replacements
      .filter(replacement => replacement.length > 0 && replacement.symbol.trim() !== '')
      .map(replacement => new KGChordRegion(
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
      throw new Error('Cannot undo chord replacement without original regions');
    }

    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found during undo');
    }

    chordTrack.setRegions(cloneChordRegions(this.originalRegions));
  }

  getDescription(): string {
    return 'Replace chord regions in range';
  }
}
