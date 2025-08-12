import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';

/**
 * Command to delete multiple MIDI notes from regions
 * Handles bulk deletion as a single undoable operation
 */
export class DeleteNotesCommand extends KGCommand {
  private noteIds: string[];
  private deletedNoteData: Array<{
    note: KGMidiNote;
    regionId: string;
    originalIndex: number;
  }> = [];

  constructor(noteIds: string[]) {
    super();
    this.noteIds = noteIds;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Clear any existing deleted note data to prevent duplicates on re-execution
    this.deletedNoteData = [];

    // Find and store all notes to delete
    for (const noteId of this.noteIds) {
      for (const track of tracks) {
        const regions = track.getRegions();
        
        for (const region of regions) {
          if (region instanceof KGMidiRegion) {
            const notes = region.getNotes();
            const noteIndex = notes.findIndex(note => note.getId() === noteId);
            
            if (noteIndex !== -1) {
              const noteToDelete = notes[noteIndex];
              
              // Store for undo
              this.deletedNoteData.push({
                note: noteToDelete,
                regionId: region.getId(),
                originalIndex: noteIndex
              });
              
              break; // Found the note, move to next noteId
            }
          }
        }
      }
    }

    if (this.deletedNoteData.length === 0) {
      throw new Error('No notes found to delete');
    }

    // Sort by original index in descending order to maintain correct indices during deletion
    this.deletedNoteData.sort((a, b) => b.originalIndex - a.originalIndex);

    // Delete all notes from their regions
    for (const data of this.deletedNoteData) {
      // Find the region again
      for (const track of tracks) {
        const regions = track.getRegions();
        const region = regions.find(r => r.getId() === data.regionId);
        
        if (region && region instanceof KGMidiRegion) {
          region.removeNote(data.note.getId());
          
          // Clear selection if this note was selected
          const selectedItems = core.getSelectedItems();
          const selectedNote = selectedItems.find(item => 
            item instanceof KGMidiNote && item.getId() === data.note.getId()
          );
          if (selectedNote) {
            core.removeSelectedItem(selectedNote);
          }
          
          break;
        }
      }
    }

    console.log(`Deleted ${this.deletedNoteData.length} notes from ${new Set(this.deletedNoteData.map(d => d.regionId)).size} regions`);
  }

  undo(): void {
    if (this.deletedNoteData.length === 0) {
      throw new Error('Cannot undo: no note data stored');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Restore all notes in reverse order (original index ascending)
    const sortedData = [...this.deletedNoteData].sort((a, b) => a.originalIndex - b.originalIndex);

    for (const data of sortedData) {
      // Find the target region
      for (const track of tracks) {
        const regions = track.getRegions();
        const region = regions.find(r => r.getId() === data.regionId);
        
        if (region && region instanceof KGMidiRegion) {
          const notes = region.getNotes();
          
          // Insert note at original position
          if (data.originalIndex >= 0 && data.originalIndex <= notes.length) {
            notes.splice(data.originalIndex, 0, data.note);
            region.setNotes(notes);
          } else {
            // Fallback: add to the end
            region.addNote(data.note);
          }
          
          break;
        }
      }
    }

    console.log(`Restored ${this.deletedNoteData.length} notes to their original positions`);
  }

  getDescription(): string {
    if (this.deletedNoteData.length === 1) {
      const note = this.deletedNoteData[0].note;
      // Convert MIDI pitch to note name for user-friendly description
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(note.getPitch() / 12) - 1;
      const noteName = noteNames[note.getPitch() % 12];
      return `Delete note ${noteName}${octave}`;
    }
    return `Delete ${this.noteIds.length} notes`;
  }

  /**
   * Get the IDs of notes that were/will be deleted
   */
  public getNoteIds(): string[] {
    return this.noteIds;
  }

  /**
   * Get the deleted note data (only available after execute)
   */
  public getDeletedNoteData(): Array<{note: KGMidiNote; regionId: string; originalIndex: number}> {
    return this.deletedNoteData;
  }

  /**
   * Get the regions that were affected by this deletion
   */
  public getAffectedRegionIds(): string[] {
    return Array.from(new Set(this.deletedNoteData.map(data => data.regionId)));
  }
}

/**
 * Command to delete a single MIDI note (convenience wrapper)
 */
export class DeleteNoteCommand extends DeleteNotesCommand {
  constructor(noteId: string) {
    super([noteId]);
  }

  getDescription(): string {
    if (this.getDeletedNoteData().length === 1) {
      const note = this.getDeletedNoteData()[0].note;
      // Convert MIDI pitch to note name for user-friendly description
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(note.getPitch() / 12) - 1;
      const noteName = noteNames[note.getPitch() % 12];
      return `Delete note ${noteName}${octave}`;
    }
    return 'Delete note';
  }
}