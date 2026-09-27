import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import { findGlobalTrackByType, findNonOverlappingNeighborBounds, getSongEndTick } from '../../../util/globalTrackUtil';

export class CreateChordRegionCommand extends KGCommand {
  private readonly startTick: number;
  private readonly preferredLength: number;
  private readonly symbol: string;
  private readonly regionId: string;
  private createdRegion: KGChordRegion | null = null;

  constructor(startTick: number, preferredLength: number, symbol: string = 'C', regionId?: string) {
    super();
    this.startTick = startTick;
    this.preferredLength = preferredLength;
    this.symbol = symbol;
    this.regionId = regionId ?? generateUniqueId('KGChordRegion');
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found');
    }

    const { maxEndTick } = findNonOverlappingNeighborBounds(project, GlobalTrackType.Chord, null, this.startTick);
    const songEndTick = getSongEndTick(project);
    const allowedEndTick = Math.min(maxEndTick, songEndTick);
    const targetEndTick = Math.min(this.startTick + this.preferredLength, allowedEndTick);
    const length = Math.max(1, targetEndTick - this.startTick);

    this.createdRegion = new KGChordRegion(
      this.regionId,
      chordTrack.getId(),
      chordTrack.getTrackIndex(),
      this.symbol,
      this.startTick,
      length
    );

    chordTrack.setRegions(
      [...chordTrack.getRegions(), this.createdRegion]
        .sort((left, right) => left.getStartTick() - right.getStartTick())
    );
  }

  undo(): void {
    const project = KGCore.instance().getCurrentProject();
    const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
    if (!chordTrack) {
      throw new Error('Chord global track not found during undo');
    }

    chordTrack.removeRegion(this.regionId);
  }

  getDescription(): string {
    return `Create chord "${this.symbol}"`;
  }

  public getCreatedRegion(): KGChordRegion | null {
    return this.createdRegion;
  }
}
