import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

interface PitchBendSnapshot {
  pitchBendId: string;
  beat: number;
  value: number;
}

interface PitchBendUpdate {
  pitchBendId: string;
  beat?: number;
  value?: number;
}

export class UpdatePitchBendPropertiesCommand extends KGCommand {
  private regionId: string;
  private snapshots: PitchBendSnapshot[];
  private updates: PitchBendUpdate[];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, snapshots: PitchBendSnapshot[], updates: PitchBendUpdate[]) {
    super();
    this.regionId = regionId;
    this.snapshots = [...snapshots];
    this.updates = [...updates];
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();

    for (const track of tracks) {
      const region = track.getRegions().find(r => r.getId() === this.regionId) as KGMidiRegion | undefined;
      if (region) {
        this.targetRegion = region;
        this.parentTrack = track;
        break;
      }
    }

    if (!this.targetRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    const pitchBends = this.targetRegion.getPitchBends();
    for (const update of this.updates) {
      const pitchBend = pitchBends.find(candidate => candidate.getId() === update.pitchBendId);
      if (pitchBend) {
        if (update.beat !== undefined) pitchBend.setBeat(update.beat);
        if (update.value !== undefined) pitchBend.setValue(update.value);
      }
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: command was not executed');
    }

    const pitchBends = this.targetRegion.getPitchBends();
    this.snapshots.forEach(snapshot => {
      const pitchBend = pitchBends.find(candidate => candidate.getId() === snapshot.pitchBendId);
      if (pitchBend) {
        pitchBend.setBeat(snapshot.beat);
        pitchBend.setValue(snapshot.value);
      }
    });
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1 ? 'Update pitch bend properties' : `Update ${count} pitch bends' properties`;
  }

  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }
}
