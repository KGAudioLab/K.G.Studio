import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiRegion } from '../../region/KGMidiRegion';

interface DeletedNoteData {
  note: KGMidiNote;
  regionId: string;
  originalIndex: number;
}

interface DeletedPitchBendData {
  pitchBend: KGMidiPitchBend;
  regionId: string;
  originalIndex: number;
}

export class DeleteMidiEventsCommand extends KGCommand {
  private noteIds: string[];
  private pitchBendIds: string[];
  private deletedNoteData: DeletedNoteData[] = [];
  private deletedPitchBendData: DeletedPitchBendData[] = [];

  constructor(noteIds: string[] = [], pitchBendIds: string[] = []) {
    super();
    this.noteIds = noteIds;
    this.pitchBendIds = pitchBendIds;
  }

  execute(): void {
    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();

    this.deletedNoteData = [];
    this.deletedPitchBendData = [];

    for (const noteId of this.noteIds) {
      for (const track of tracks) {
        for (const region of track.getRegions()) {
          if (!(region instanceof KGMidiRegion)) continue;

          const noteIndex = region.getNotes().findIndex(note => note.getId() === noteId);
          if (noteIndex === -1) continue;

          this.deletedNoteData.push({
            note: region.getNotes()[noteIndex],
            regionId: region.getId(),
            originalIndex: noteIndex,
          });
          break;
        }
      }
    }

    for (const pitchBendId of this.pitchBendIds) {
      for (const track of tracks) {
        for (const region of track.getRegions()) {
          if (!(region instanceof KGMidiRegion)) continue;

          const pitchBendIndex = region.getPitchBends().findIndex(pitchBend => pitchBend.getId() === pitchBendId);
          if (pitchBendIndex === -1) continue;

          this.deletedPitchBendData.push({
            pitchBend: region.getPitchBends()[pitchBendIndex],
            regionId: region.getId(),
            originalIndex: pitchBendIndex,
          });
          break;
        }
      }
    }

    if (this.deletedNoteData.length === 0 && this.deletedPitchBendData.length === 0) {
      throw new Error('No MIDI events found to delete');
    }

    this.deletedNoteData.sort((a, b) => b.originalIndex - a.originalIndex);
    this.deletedPitchBendData.sort((a, b) => b.originalIndex - a.originalIndex);

    for (const data of this.deletedNoteData) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removeNote(data.note.getId());

      const selectedNote = core.getSelectedItems().find(item => item instanceof KGMidiNote && item.getId() === data.note.getId());
      if (selectedNote) {
        core.removeSelectedItem(selectedNote);
      }
    }

    for (const data of this.deletedPitchBendData) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removePitchBend(data.pitchBend.getId());

      const selectedPitchBend = core.getSelectedItems().find(
        item => item instanceof KGMidiPitchBend && item.getId() === data.pitchBend.getId()
      );
      if (selectedPitchBend) {
        core.removeSelectedItem(selectedPitchBend);
      }
    }
  }

  undo(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();

    for (const data of [...this.deletedNoteData].sort((a, b) => a.originalIndex - b.originalIndex)) {
      const region = this.resolveRegion(tracks, data.regionId);
      const notes = region.getNotes();
      if (data.originalIndex >= 0 && data.originalIndex <= notes.length) {
        notes.splice(data.originalIndex, 0, data.note);
        region.setNotes(notes);
      } else {
        region.addNote(data.note);
      }
    }

    for (const data of [...this.deletedPitchBendData].sort((a, b) => a.originalIndex - b.originalIndex)) {
      const region = this.resolveRegion(tracks, data.regionId);
      const pitchBends = region.getPitchBends();
      if (data.originalIndex >= 0 && data.originalIndex <= pitchBends.length) {
        pitchBends.splice(data.originalIndex, 0, data.pitchBend);
        region.setPitchBends(pitchBends);
      } else {
        region.addPitchBend(data.pitchBend);
      }
    }
  }

  getDescription(): string {
    const noteCount = this.noteIds.length;
    const pitchBendCount = this.pitchBendIds.length;

    if (noteCount > 0 && pitchBendCount > 0) {
      return `Delete ${noteCount} note${noteCount === 1 ? '' : 's'} and ${pitchBendCount} pitch bend${pitchBendCount === 1 ? '' : 's'}`;
    }
    if (pitchBendCount > 0) {
      return pitchBendCount === 1 ? 'Delete pitch bend' : `Delete ${pitchBendCount} pitch bends`;
    }
    return noteCount === 1 ? 'Delete note' : `Delete ${noteCount} notes`;
  }

  private resolveRegion(tracks: Array<{ getRegions(): unknown[] }>, regionId: string): KGMidiRegion {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate instanceof KGMidiRegion && candidate.getId() === regionId);
      if (region instanceof KGMidiRegion) {
        return region;
      }
    }

    throw new Error(`MIDI region with ID ${regionId} not found`);
  }
}
