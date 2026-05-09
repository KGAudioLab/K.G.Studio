import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack } from '../../track/KGTrack';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../../track/KGTrackAutomationPoint';
import { instantiateTrackAutomationPoints } from '../../../util/trackAutomationUtil';

interface TrackAutomationPointSnapshot {
  pointId: string;
  beat: number;
  value: number;
}

interface TrackAutomationPointUpdate {
  pointId: string;
  beat?: number;
  value?: number;
}

export class UpdateTrackAutomationPointsCommand extends KGCommand {
  private readonly trackId: number;
  private readonly automationType: TrackAutomationType;
  private readonly snapshots: TrackAutomationPointSnapshot[];
  private readonly updates: TrackAutomationPointUpdate[];
  private targetTrack: KGTrack | null = null;
  private originalPoints: KGTrackAutomationPoint[] = [];

  constructor(
    trackId: number,
    automationType: TrackAutomationType,
    snapshots: TrackAutomationPointSnapshot[],
    updates: TrackAutomationPointUpdate[]
  ) {
    super();
    this.trackId = trackId;
    this.automationType = automationType;
    this.snapshots = [...snapshots];
    this.updates = [...updates];
  }

  execute(): void {
    this.targetTrack = this.resolveTrack();
    this.originalPoints = [...this.targetTrack.getAutomationPoints(this.automationType)];
    const nextPoints = instantiateTrackAutomationPoints(this.automationType, this.originalPoints.map(point => {
      const update = this.updates.find(candidate => candidate.pointId === point.getId());
      return {
        id: point.getId(),
        beat: update?.beat ?? point.getBeat(),
        value: update?.value ?? point.getValue(),
      };
    }));
    this.targetTrack.setAutomationPoints(this.automationType, nextPoints);
  }

  undo(): void {
    if (!this.targetTrack) {
      throw new Error('Cannot undo: command was not executed');
    }

    this.targetTrack.setAutomationPoints(this.automationType, this.originalPoints);
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1
      ? `Update ${this.automationType} automation point`
      : `Update ${count} ${this.automationType} automation points`;
  }

  private resolveTrack(): KGTrack {
    const track = KGCore.instance().getCurrentProject().getTracks().find(candidate => candidate.getId() === this.trackId);
    if (!track) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }

    return track;
  }
}
