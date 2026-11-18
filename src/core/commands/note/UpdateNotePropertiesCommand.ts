import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote, type MidiArticulation } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

interface NoteUpdate {
  noteId: string;
  pitch?: number;
  velocity?: number;
  articulation?: MidiArticulation;
  startTick?: number;
  endTick?: number;
}

export class UpdateNotePropertiesCommand extends KGCommand {
  private regionId: string;
  private snapshots: NoteUpdate[];
  private updates: NoteUpdate[];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, snapshots: NoteUpdate[], updates: NoteUpdate[]) {
    super();
    this.regionId = regionId;
    this.snapshots = [...snapshots];
    this.updates = [...updates];
  }

  execute(): void {
    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();

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

    this.applyUpdates(this.targetRegion, this.updates);
  }

  private applyUpdates(region: KGMidiRegion, updates: NoteUpdate[]): void {
    const notes = region.getNotes();
    for (const update of updates) {
      const note = notes.find((n: KGMidiNote) => n.getId() === update.noteId);
      if (note) {
        if (update.pitch !== undefined) note.setPitch(update.pitch);
        if (update.velocity !== undefined) note.setVelocity(update.velocity);
        if (update.articulation !== undefined) note.setArticulation(update.articulation);
        if (update.startTick !== undefined) note.setStartTick(update.startTick);
        if (update.endTick !== undefined) note.setEndTick(update.endTick);
      }
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: command was not executed');
    }

    this.applyUpdates(this.targetRegion, this.snapshots);
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1 ? 'Update note properties' : `Update ${count} notes' properties`;
  }

  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }
}
