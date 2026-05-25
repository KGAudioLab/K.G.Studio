import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { GlobalTrackType } from '../../global-track';
import { KGChordRegion } from '../../region/KGChordRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import { findGlobalTrackByType, findNonOverlappingNeighborBounds, getSongEndBeat } from '../../../util/globalTrackUtil';

export class CreateChordRegionCommand extends KGCommand {
  private readonly startBeat: number;
  private readonly preferredLength: number;
  private readonly symbol: string;
  private readonly regionId: string;
  private createdRegion: KGChordRegion | null = null;

  constructor(startBeat: number, preferredLength: number, symbol: string = 'C', regionId?: string) {
    super();
    this.startBeat = startBeat;
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

    const { maxEndBeat } = findNonOverlappingNeighborBounds(project, GlobalTrackType.Chord, null, this.startBeat);
    const songEndBeat = getSongEndBeat(project);
    const allowedEndBeat = Math.min(maxEndBeat, songEndBeat);
    const targetEndBeat = Math.min(this.startBeat + this.preferredLength, allowedEndBeat);
    const length = Math.max(1, targetEndBeat - this.startBeat);

    this.createdRegion = new KGChordRegion(
      this.regionId,
      chordTrack.getId(),
      chordTrack.getTrackIndex(),
      this.symbol,
      this.startBeat,
      length
    );

    chordTrack.setRegions(
      [...chordTrack.getRegions(), this.createdRegion]
        .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat())
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
