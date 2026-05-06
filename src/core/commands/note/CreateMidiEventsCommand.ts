import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';
import { generateUniqueId } from '../../../util/miscUtil';

export interface NoteCreationData {
  regionId: string;
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
  noteId?: string;
}

export interface PitchBendCreationData {
  regionId: string;
  beat: number;
  value: number;
  pitchBendId?: string;
}

export class CreateMidiEventsCommand extends KGCommand {
  private noteCreationData: NoteCreationData[];
  private pitchBendCreationData: PitchBendCreationData[];
  private createdNotes: Array<{ note: KGMidiNote; regionId: string }> = [];
  private createdPitchBends: Array<{ pitchBend: KGMidiPitchBend; regionId: string }> = [];

  constructor(noteCreationData: NoteCreationData[], pitchBendCreationData: PitchBendCreationData[] = []) {
    super();
    this.noteCreationData = noteCreationData.map(data => ({
      ...data,
      noteId: data.noteId || generateUniqueId('KGMidiNote'),
    }));
    this.pitchBendCreationData = pitchBendCreationData.map(data => ({
      ...data,
      pitchBendId: data.pitchBendId || generateUniqueId('KGMidiPitchBend'),
    }));
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();
    this.createdNotes = [];
    this.createdPitchBends = [];

    for (const noteData of this.noteCreationData) {
      const targetRegion = this.resolveRegion(tracks, noteData.regionId);
      const newNote = new KGMidiNote(
        noteData.noteId!,
        noteData.startBeat,
        noteData.endBeat,
        noteData.pitch,
        noteData.velocity
      );
      targetRegion.addNote(newNote);
      this.createdNotes.push({ note: newNote, regionId: noteData.regionId });
    }

    for (const pitchBendData of this.pitchBendCreationData) {
      const targetRegion = this.resolveRegion(tracks, pitchBendData.regionId);
      const newPitchBend = new KGMidiPitchBend(
        pitchBendData.pitchBendId!,
        pitchBendData.beat,
        pitchBendData.value
      );
      targetRegion.addPitchBend(newPitchBend);
      this.createdPitchBends.push({ pitchBend: newPitchBend, regionId: pitchBendData.regionId });
    }
  }

  undo(): void {
    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();

    for (const data of this.createdNotes) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removeNote(data.note.getId());
      const selectedNote = core.getSelectedItems().find(item => item instanceof KGMidiNote && item.getId() === data.note.getId());
      if (selectedNote) {
        core.removeSelectedItem(selectedNote);
      }
    }

    for (const data of this.createdPitchBends) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removePitchBend(data.pitchBend.getId());
      const selectedPitchBend = core.getSelectedItems().find(item => item instanceof KGMidiPitchBend && item.getId() === data.pitchBend.getId());
      if (selectedPitchBend) {
        core.removeSelectedItem(selectedPitchBend);
      }
    }
  }

  getDescription(): string {
    const noteCount = this.noteCreationData.length;
    const pitchBendCount = this.pitchBendCreationData.length;

    if (noteCount > 0 && pitchBendCount > 0) {
      return `Create ${noteCount} note${noteCount === 1 ? '' : 's'} and ${pitchBendCount} pitch bend${pitchBendCount === 1 ? '' : 's'}`;
    }
    if (pitchBendCount > 0) {
      return pitchBendCount === 1 ? 'Create pitch bend' : `Create ${pitchBendCount} pitch bends`;
    }
    return noteCount === 1 ? 'Create note' : `Create ${noteCount} notes`;
  }

  public getNoteCreationData(): NoteCreationData[] {
    return this.noteCreationData;
  }

  public getCreatedNotes(): Array<{ note: KGMidiNote; regionId: string }> {
    return this.createdNotes;
  }

  public getCreatedNoteIds(): string[] {
    return this.noteCreationData.map(data => data.noteId!);
  }

  private resolveRegion(tracks: KGTrack[], regionId: string): KGMidiRegion {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === regionId);
      if (region instanceof KGMidiRegion) {
        return region;
      }
    }

    throw new Error(`MIDI region with ID ${regionId} not found`);
  }
}
