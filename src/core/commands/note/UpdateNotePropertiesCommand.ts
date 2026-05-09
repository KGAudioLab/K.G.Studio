import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

interface NoteSnapshot {
  noteId: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  endBeat: number;
}

interface NoteUpdate {
  noteId: string;
  pitch?: number;
  velocity?: number;
  startBeat?: number;
  endBeat?: number;
}

export class UpdateNotePropertiesCommand extends KGCommand {
  private regionId: string;
  private snapshots: NoteSnapshot[];
  private updates: NoteUpdate[];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, snapshots: NoteSnapshot[], updates: NoteUpdate[]) {
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

    const notes = this.targetRegion.getNotes();
    for (const update of this.updates) {
      const note = notes.find((n: KGMidiNote) => n.getId() === update.noteId);
      if (note) {
        if (update.pitch !== undefined) note.setPitch(update.pitch);
        if (update.velocity !== undefined) note.setVelocity(update.velocity);
        if (update.startBeat !== undefined) note.setStartBeat(update.startBeat);
        if (update.endBeat !== undefined) note.setEndBeat(update.endBeat);
      }
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: command was not executed');
    }

    const notes = this.targetRegion.getNotes();
    for (const snap of this.snapshots) {
      const note = notes.find((n: KGMidiNote) => n.getId() === snap.noteId);
      if (note) {
        note.setPitch(snap.pitch);
        note.setVelocity(snap.velocity);
        note.setStartBeat(snap.startBeat);
        note.setEndBeat(snap.endBeat);
      }
    }
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1 ? 'Update note properties' : `Update ${count} notes' properties`;
  }

  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }
}
