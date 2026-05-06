import { KGMidiNote } from '../../midi/KGMidiNote';
import { CreateMidiEventsCommand, type NoteCreationData } from './CreateMidiEventsCommand';

export type { NoteCreationData } from './CreateMidiEventsCommand';

/**
 * Command to create multiple MIDI notes in regions
 * Handles bulk creation as a single undoable operation
 */
export class CreateNotesCommand extends CreateMidiEventsCommand {
  constructor(noteCreationData: NoteCreationData[]) {
    super(noteCreationData, []);
  }

  getDescription(): string {
    const noteCreationData = this.getNoteCreationData();
    if (noteCreationData.length === 1) {
      const noteData = noteCreationData[0];
      // Convert MIDI pitch to note name for user-friendly description
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor(noteData.pitch / 12) - 1;
      const noteName = noteNames[noteData.pitch % 12];
      return `Create note ${noteName}${octave}`;
    }
    return `Create ${noteCreationData.length} notes`;
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
