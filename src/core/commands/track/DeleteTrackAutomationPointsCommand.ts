import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack } from '../../track/KGTrack';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../../track/KGTrackAutomationPoint';

export class DeleteTrackAutomationPointsCommand extends KGCommand {
  private readonly trackId: number;
  private readonly automationType: TrackAutomationType;
  private readonly pointIds: string[];
  private targetTrack: KGTrack | null = null;
  private originalPoints: KGTrackAutomationPoint[] = [];

  constructor(trackId: number, automationType: TrackAutomationType, pointIds: string[]) {
    super();
    this.trackId = trackId;
    this.automationType = automationType;
    this.pointIds = pointIds;
  }

  execute(): void {
    this.targetTrack = this.resolveTrack();
    this.originalPoints = [...this.targetTrack.getAutomationPoints(this.automationType)];
    const remainingPoints = this.originalPoints.filter(point => !this.pointIds.includes(point.getId()));
    if (remainingPoints.length === this.originalPoints.length) {
      throw new Error('No track automation points found to delete');
    }

    this.targetTrack.setAutomationPoints(this.automationType, remainingPoints);
    const core = KGCore.instance();
    core.getSelectedItems()
      .filter(item => item instanceof KGTrackAutomationPoint && this.pointIds.includes(item.getId()))
      .forEach(item => core.removeSelectedItem(item));
  }

  undo(): void {
    if (!this.targetTrack) {
      throw new Error('Cannot undo: command was not executed');
    }

    this.targetTrack.setAutomationPoints(this.automationType, this.originalPoints);
  }

  getDescription(): string {
    const count = this.pointIds.length;
    return count === 1
      ? `Delete ${this.automationType} automation point`
      : `Delete ${count} ${this.automationType} automation points`;
  }

  private resolveTrack(): KGTrack {
    const track = KGCore.instance().getCurrentProject().getTracks().find(candidate => candidate.getId() === this.trackId);
    if (!track) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }

    return track;
  }
}
