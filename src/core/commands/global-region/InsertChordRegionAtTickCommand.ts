import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import { findChordRegionAtTick, findGlobalTrackByType } from '../../../util/globalTrackUtil';

export class InsertChordRegionAtTickCommand extends KGCommand {
  private readonly insertTick: number;
  private readonly symbol: string;
  private readonly regionId: string;
  private createdRegion: KGChordRegion | null = null;
  private targetRegionId: string | null = null;
  private originalTargetLength = 0;

  constructor(insertTick: number, symbol: string = 'C', regionId?: string) {
    super();
    this.insertTick = insertTick;
    this.symbol = symbol;
    this.regionId = regionId ?? generateUniqueId('KGChordRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found');
    }

    const occupiedRegion = findChordRegionAtTick(project, this.insertTick);
    if (!occupiedRegion) {
      throw new Error(`No chord region found at tick ${this.insertTick}`);
    }

    const regionStart = occupiedRegion.getStartTick();
    const regionEnd = regionStart + occupiedRegion.getLengthTicks();
    if (this.insertTick <= regionStart || this.insertTick >= regionEnd) {
      throw new Error(`Cannot insert chord at tick ${this.insertTick} without shrinking region below minimum length`);
    }

    this.targetRegionId = occupiedRegion.getId();
    this.originalTargetLength = occupiedRegion.getLengthTicks();
    occupiedRegion.setLengthTicks(this.insertTick - regionStart);

    this.createdRegion = new KGChordRegion(
      this.regionId,
      chordTrack.getId(),
      chordTrack.getTrackIndex(),
      this.symbol,
      this.insertTick,
      regionEnd - this.insertTick
    );

    chordTrack.setRegions(
      [...chordTrack.getRegions(), this.createdRegion]
        .sort((left, right) => left.getStartTick() - right.getStartTick())
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

    targetRegion.setLengthTicks(this.originalTargetLength);
    chordTrack.setRegions([...chordTrack.getRegions()].sort((left, right) => left.getStartTick() - right.getStartTick()));
  }

  getDescription(): string {
    return `Insert chord "${this.symbol}"`;
  }

  public getCreatedRegion(): KGChordRegion | null {
    return this.createdRegion;
  }
}
