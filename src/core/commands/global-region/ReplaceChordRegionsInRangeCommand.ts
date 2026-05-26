import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { findGlobalTrackByType } from '../../../util/globalTrackUtil';
import { generateUniqueId } from '../../../util/miscUtil';

export interface ChordRegionReplacementData {
  startBeat: number;
  length: number;
  symbol: string;
}

function cloneChordRegion(region: KGChordRegion): KGChordRegion {
  return new KGChordRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getSymbol(),
    region.getStartFromBeat(),
    region.getLength(),
  );
}

function cloneChordRegions(regions: KGChordRegion[]): KGChordRegion[] {
  return regions.map(cloneChordRegion);
}

export class ReplaceChordRegionsInRangeCommand extends KGCommand {
  private readonly rangeStartBeat: number;
  private readonly rangeEndBeat: number;
  private readonly replacements: ChordRegionReplacementData[];
  private originalRegions: KGChordRegion[] | null = null;
  private nextRegions: KGChordRegion[] | null = null;

  constructor(rangeStartBeat: number, rangeEndBeat: number, replacements: ChordRegionReplacementData[]) {
    super();
    this.rangeStartBeat = Math.max(0, rangeStartBeat);
    this.rangeEndBeat = Math.max(this.rangeStartBeat, rangeEndBeat);
    this.replacements = replacements.map(replacement => ({
      startBeat: replacement.startBeat,
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
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

    this.originalRegions = cloneChordRegions(currentRegions);

    const preservedRegions: KGChordRegion[] = [];
    for (const region of currentRegions) {
      const regionStart = region.getStartFromBeat();
      const regionEnd = regionStart + region.getLength();

      if (regionEnd <= this.rangeStartBeat || regionStart >= this.rangeEndBeat) {
        preservedRegions.push(cloneChordRegion(region));
        continue;
      }

      if (regionStart < this.rangeStartBeat) {
        preservedRegions.push(new KGChordRegion(
          region.getId(),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getSymbol(),
          regionStart,
          this.rangeStartBeat - regionStart,
        ));
      }

      if (regionEnd > this.rangeEndBeat) {
        preservedRegions.push(new KGChordRegion(
          generateUniqueId('KGChordRegion'),
          region.getTrackId(),
          region.getTrackIndex(),
          region.getSymbol(),
          this.rangeEndBeat,
          regionEnd - this.rangeEndBeat,
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
        replacement.startBeat,
        replacement.length,
      ));

    this.nextRegions = [...preservedRegions, ...replacementRegions]
      .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

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
