import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGTrack } from '../../track/KGTrack';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../../track/KGTrackAutomationPoint';
import { generateUniqueId } from '../../../util/miscUtil';
import { instantiateTrackAutomationPoints } from '../../../util/trackAutomationUtil';

export interface TrackAutomationPointCreationData {
  beat: number;
  value: number;
  pointId?: string;
}

export class CreateTrackAutomationPointsCommand extends KGCommand {
  private readonly trackId: number;
  private readonly automationType: TrackAutomationType;
  private readonly creationData: TrackAutomationPointCreationData[];
  private targetTrack: KGTrack | null = null;
  private originalPoints: KGTrackAutomationPoint[] = [];
  private createdPointIds: string[] = [];

  constructor(trackId: number, automationType: TrackAutomationType, creationData: TrackAutomationPointCreationData[]) {
    super();
    this.trackId = trackId;
    this.automationType = automationType;
    this.creationData = creationData.map(data => ({
      ...data,
      pointId: data.pointId ?? generateUniqueId('KGTrackAutomationPoint'),
    }));
  }

  execute(): void {
    this.targetTrack = this.resolveTrack();
    this.originalPoints = [...this.targetTrack.getAutomationPoints(this.automationType)];
    const nextPoints = instantiateTrackAutomationPoints(this.automationType, [
      ...this.originalPoints.map(point => ({
        id: point.getId(),
        beat: point.getBeat(),
        value: point.getValue(),
      })),
      ...this.creationData.map(data => ({
        id: data.pointId!,
        beat: data.beat,
        value: data.value,
      })),
    ]);
    this.createdPointIds = nextPoints
      .filter(point => this.creationData.some(data => data.pointId === point.getId()))
      .map(point => point.getId());
    this.targetTrack.setAutomationPoints(this.automationType, nextPoints);
  }

  undo(): void {
    if (!this.targetTrack) {
      throw new Error('Cannot undo: command was not executed');
    }

    this.targetTrack.setAutomationPoints(this.automationType, this.originalPoints);
    const core = KGCore.instance();
    core.getSelectedItems()
      .filter(item => item instanceof KGTrackAutomationPoint && this.createdPointIds.includes(item.getId()))
      .forEach(item => core.removeSelectedItem(item));
  }

  getDescription(): string {
    const count = this.creationData.length;
    return count === 1
      ? `Create ${this.automationType} automation point`
      : `Create ${count} ${this.automationType} automation points`;
  }

  public getCreatedPointIds(): string[] {
    return this.createdPointIds;
  }

  private resolveTrack(): KGTrack {
    const track = KGCore.instance().getCurrentProject().getTracks().find(candidate => candidate.getId() === this.trackId);
    if (!track) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }

    return track;
  }
}
