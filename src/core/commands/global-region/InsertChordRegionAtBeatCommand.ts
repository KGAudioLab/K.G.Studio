import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import { findChordRegionAtBeat, findGlobalTrackByType } from '../../../util/globalTrackUtil';

export class InsertChordRegionAtBeatCommand extends KGCommand {
  private readonly insertBeat: number;
  private readonly symbol: string;
  private readonly regionId: string;
  private createdRegion: KGChordRegion | null = null;
  private targetRegionId: string | null = null;
  private originalTargetLength = 0;

  constructor(insertBeat: number, symbol: string = 'C', regionId?: string) {
    super();
    this.insertBeat = insertBeat;
    this.symbol = symbol;
    this.regionId = regionId ?? generateUniqueId('KGChordRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found');
    }

    const occupiedRegion = findChordRegionAtBeat(project, this.insertBeat);
    if (!occupiedRegion) {
      throw new Error(`No chord region found at beat ${this.insertBeat}`);
    }

    const regionStart = occupiedRegion.getStartFromBeat();
    const regionEnd = regionStart + occupiedRegion.getLength();
    if (this.insertBeat <= regionStart || this.insertBeat >= regionEnd) {
      throw new Error(`Cannot insert chord at beat ${this.insertBeat} without shrinking region below minimum length`);
    }

    this.targetRegionId = occupiedRegion.getId();
    this.originalTargetLength = occupiedRegion.getLength();
    occupiedRegion.setLength(this.insertBeat - regionStart);

    this.createdRegion = new KGChordRegion(
      this.regionId,
      chordTrack.getId(),
      chordTrack.getTrackIndex(),
      this.symbol,
      this.insertBeat,
      regionEnd - this.insertBeat
    );

    chordTrack.setRegions(
      [...chordTrack.getRegions(), this.createdRegion]
        .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat())
    );
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack || !this.targetRegionId || !this.createdRegion) {
      throw new Error('Cannot undo inserted chord region');
    }

    chordTrack.removeRegion(this.createdRegion.getId());
    const targetRegion = chordTrack.getRegions().find((region): region is KGChordRegion => (
      region instanceof KGChordRegion && region.getId() === this.targetRegionId
    ));
    if (!targetRegion) {
      throw new Error(`Chord region ${this.targetRegionId} not found during undo`);
    }

    targetRegion.setLength(this.originalTargetLength);
    chordTrack.setRegions([...chordTrack.getRegions()].sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat()));
  }

  getDescription(): string {
    return `Insert chord "${this.symbol}"`;
  }

  public getCreatedRegion(): KGChordRegion | null {
    return this.createdRegion;
  }
}
