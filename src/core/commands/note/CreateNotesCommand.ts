import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { generateUniqueId } from '../../../util/miscUtil';

/**
 * Data structure for a note to be created
 */
export interface NoteCreationData {
  regionId: string;
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
  noteId?: string;
}

/**
 * Command to create multiple MIDI notes in regions
 * Handles bulk creation as a single undoable operation
 */
export class CreateNotesCommand extends KGCommand {
  private noteCreationData: NoteCreationData[];
  private createdNotes: Array<{
    note: KGMidiNote;
    regionId: string;
  }> = [];

  constructor(noteCreationData: NoteCreationData[]) {
    super();
    this.noteCreationData = noteCreationData.map(data => ({
      ...data,
      noteId: data.noteId || generateUniqueId('KGMidiNote')
    }));
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Clear any existing created note data to prevent duplicates on re-execution
    this.createdNotes = [];

    // Create all notes
    for (const noteData of this.noteCreationData) {
      // Find the target region
      let targetRegion: KGMidiRegion | null = null;
      
      for (const track of tracks) {
        const regions = track.getRegions();
        const region = regions.find(r => r.getId() === noteData.regionId);
        if (region && region instanceof KGMidiRegion) {
          targetRegion = region;
          break;
        }
      }

      if (!targetRegion) {
        throw new Error(`MIDI region with ID ${noteData.regionId} not found`);
      }

      // Create the new MIDI note
      const newNote = new KGMidiNote(
        noteData.noteId!,
        noteData.startBeat,
        noteData.endBeat,
        noteData.pitch,
        noteData.velocity
      );

      // Add the note to the region
      targetRegion.addNote(newNote);

      // Store for undo
      this.createdNotes.push({
        note: newNote,
        regionId: noteData.regionId
      });
    }

    const noteCount = this.createdNotes.length;
    const regionCount = new Set(this.createdNotes.map(data => data.regionId)).size;
    console.log(`Created ${noteCount} notes in ${regionCount} region${regionCount > 1 ? 's' : ''}`);
  }

  undo(): void {
    if (this.createdNotes.length === 0) {
      throw new Error('Cannot undo: no notes were created');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Remove all created notes from their regions
    for (const data of this.createdNotes) {
      // Find the region
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

    console.log(`Removed ${this.createdNotes.length} created notes from ${new Set(this.createdNotes.map(d => d.regionId)).size} regions`);
  }

  getDescription(): string {
    if (this.noteCreationData.length === 1) {
      const noteData = this.noteCreationData[0];
      // Convert MIDI pitch to note name for user-friendly description
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(noteData.pitch / 12) - 1;
      const noteName = noteNames[noteData.pitch % 12];
      return `Create note ${noteName}${octave}`;
    }
    return `Create ${this.noteCreationData.length} notes`;
  }

  /**
   * Get the note creation data that was/will be processed
   */
  public getNoteCreationData(): NoteCreationData[] {
    return this.noteCreationData;
  }

  /**
   * Get the created note instances (only available after execute)
   */
  public getCreatedNotes(): Array<{note: KGMidiNote; regionId: string}> {
    return this.createdNotes;
  }

  /**
   * Get the regions that were affected by this creation
   */
  public getAffectedRegionIds(): string[] {
    return Array.from(new Set(this.noteCreationData.map(data => data.regionId)));
  }

  /**
   * Get the IDs of notes that were/will be created
   */
  public getCreatedNoteIds(): string[] {
    return this.noteCreationData.map(data => data.noteId!);
  }
}

/**
 * Command to create a single MIDI note (convenience wrapper)
 */
export class CreateNoteCommand extends CreateNotesCommand {
  constructor(
    regionId: string,
    startBeat: number,
    endBeat: number,
    pitch: number,
    velocity: number = 127,
    noteId?: string
  ) {
    super([{
      regionId,
      startBeat,
      endBeat,
      pitch,
      velocity,
      noteId
    }]);
  }

  getDescription(): string {
    const noteData = this.getNoteCreationData()[0];
    // Convert MIDI pitch to note name for user-friendly description
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(noteData.pitch / 12) - 1;
    const noteName = noteNames[noteData.pitch % 12];
    return `Create note ${noteName}${octave}`;
  }

  /**
   * Get the ID of the note that was/will be created
   */
  public getNoteId(): string {
    return this.getCreatedNoteIds()[0];
  }

  /**
   * Get the created note instance (only available after execute)
   */
  public getCreatedNote(): KGMidiNote | null {
    const createdNotes = this.getCreatedNotes();
    return createdNotes.length > 0 ? createdNotes[0].note : null;
  }

  /**
   * Get the region ID where the note was/will be created
   */
  public getRegionId(): string {
    return this.getNoteCreationData()[0].regionId;
  }

  /**
   * Factory method to create a note command from UI coordinates
   */
  public static fromUICoordinates(
    regionId: string,
    mouseX: number,
    mouseY: number,
    pianoGridElement: HTMLElement,
    beatWidth: number,
    noteHeight: number,
    regionStartBeat: number,
    noteLength: number,
    velocity: number = 127
  ): CreateNoteCommand {
    // Calculate relative position within the grid
    const rect = pianoGridElement.getBoundingClientRect();
    const x = mouseX - rect.left;
    const y = mouseY - rect.top;

    // Calculate the beat number (relative to region start)
    const rawBeatNumber = x / beatWidth;
    const beatNumber = Math.floor(rawBeatNumber); // Snap to beat grid

    // Calculate the pitch (MIDI note number)
    // The piano roll is drawn from bottom to top, with higher notes at the top
    const pitchIndex = Math.floor(y / noteHeight);
    const pitch = 107 - pitchIndex; // Convert index to pitch (B7 is 107)

    // Calculate note start and end beats
    const noteStartBeat = beatNumber;
    const noteEndBeat = noteStartBeat + noteLength;

    return new CreateNoteCommand(
      regionId,
      noteStartBeat,
      noteEndBeat,
      pitch,
      velocity
    );
  }
}