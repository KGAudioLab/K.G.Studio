import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

/**
 * Interface for storing move data for each note
 */
interface NoteMoveData {
  noteId: string;
  originalStartBeat: number;
  originalEndBeat: number;
  originalPitch: number;
  newStartBeat: number;
  newEndBeat: number;
  newPitch: number;
}

/**
 * Command to move multiple notes simultaneously
 * Handles moving notes in both time (beat position) and pitch with delta application
 */
export class MoveNotesCommand extends KGCommand {
  private primaryNoteId: string;
  private startBeatDelta: number;
  private pitchDelta: number;
  private regionId: string;
  private noteIdsToMove: string[]; // Store the specific note IDs to move
  private noteMoveData: NoteMoveData[] = [];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(
    primaryNoteId: string,
    startBeatDelta: number,
    pitchDelta: number,
    regionId: string,
    noteIdsToMove: string[]
  ) {
    super();
    this.primaryNoteId = primaryNoteId;
    this.startBeatDelta = startBeatDelta;
    this.pitchDelta = pitchDelta;
    this.regionId = regionId;
    this.noteIdsToMove = [...noteIdsToMove]; // Create a copy to avoid reference issues
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region containing the notes
    let targetRegion: KGMidiRegion | null = null;
    let parentTrack: KGTrack | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId) as KGMidiRegion | undefined;
      if (region) {
        targetRegion = region;
        parentTrack = track;
        break;
      }
    }

    if (!targetRegion || !parentTrack) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    this.targetRegion = targetRegion;
    this.parentTrack = parentTrack;

    // Clear any existing move data (for re-execution)
    this.noteMoveData = [];

    // Find all notes to move based on the stored note IDs
    const notesToMove = this.noteIdsToMove
      .map(noteId => targetRegion.getNotes().find(n => n.getId() === noteId))
      .filter(note => note !== undefined) as KGMidiNote[];

    if (notesToMove.length === 0) {
      throw new Error(`No notes found to move from the provided note IDs`);
    }

    // Verify the primary note is included
    const primaryNote = notesToMove.find(n => n.getId() === this.primaryNoteId);
    if (!primaryNote) {
      throw new Error(`Primary note with ID ${this.primaryNoteId} not found in notes to move`);
    }

    // Store original positions and calculate new positions
    notesToMove.forEach(note => {
      const originalStartBeat = note.getStartBeat();
      const originalEndBeat = note.getEndBeat();
      const originalPitch = note.getPitch();

      // Apply the deltas to calculate new positions
      const newStartBeat = originalStartBeat + this.startBeatDelta;
      const newEndBeat = originalEndBeat + this.startBeatDelta; // End beat moves by same amount as start
      const newPitch = originalPitch + this.pitchDelta;

      // Store move data for undo
      this.noteMoveData.push({
        noteId: note.getId(),
        originalStartBeat,
        originalEndBeat,
        originalPitch,
        newStartBeat,
        newEndBeat,
        newPitch
      });
    });

    // Apply all the move operations
    this.noteMoveData.forEach(data => {
      const note = targetRegion.getNotes().find(n => n.getId() === data.noteId);
      if (note) {
        note.setStartBeat(data.newStartBeat);
        note.setEndBeat(data.newEndBeat);
        note.setPitch(data.newPitch);
      }
    });

    const beatDescription = this.startBeatDelta !== 0 ? `position: ${this.startBeatDelta > 0 ? '+' : ''}${this.startBeatDelta.toFixed(3)} beats` : '';
    const pitchDescription = this.pitchDelta !== 0 ? `pitch: ${this.pitchDelta > 0 ? '+' : ''}${this.pitchDelta} semitones` : '';
    const deltaDescription = [beatDescription, pitchDescription].filter(d => d).join(', ');
    
    console.log(`Moved ${this.noteMoveData.length} notes (${deltaDescription}, primary note: ${this.primaryNoteId})`);
  }

  undo(): void {
    if (!this.targetRegion || this.noteMoveData.length === 0) {
      throw new Error('Cannot undo: no notes were moved');
    }

    // Restore all notes to their original positions
    this.noteMoveData.forEach(data => {
      const note = this.targetRegion!.getNotes().find(n => n.getId() === data.noteId);
      if (note) {
        note.setStartBeat(data.originalStartBeat);
        note.setEndBeat(data.originalEndBeat);
        note.setPitch(data.originalPitch);
      }
    });

    console.log(`Restored ${this.noteMoveData.length} notes to their original positions`);
  }

  getDescription(): string {
    const noteCount = this.noteMoveData.length;
    
    // Create a description based on the type of movement
    const movements: string[] = [];
    if (this.startBeatDelta !== 0) {
      const direction = this.startBeatDelta > 0 ? 'right' : 'left';
      movements.push(`${direction} ${Math.abs(this.startBeatDelta).toFixed(3)} beats`);
    }
    if (this.pitchDelta !== 0) {
      const direction = this.pitchDelta > 0 ? 'up' : 'down';
      movements.push(`${direction} ${Math.abs(this.pitchDelta)} semitones`);
    }
    
    const movementDescription = movements.length > 0 ? ` ${movements.join(' and ')}` : '';
    
    if (noteCount === 1) {
      return `Move note${movementDescription}`;
    } else {
      return `Move ${noteCount} notes${movementDescription}`;
    }
  }

  /**
   * Get the primary note ID
   */
  public getPrimaryNoteId(): string {
    return this.primaryNoteId;
  }

  /**
   * Get the start beat delta
   */
  public getStartBeatDelta(): number {
    return this.startBeatDelta;
  }

  /**
   * Get the pitch delta
   */
  public getPitchDelta(): number {
    return this.pitchDelta;
  }

  /**
   * Get the region ID
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the note IDs that will be moved
   */
  public getNoteIdsToMove(): string[] {
    return [...this.noteIdsToMove];
  }

  /**
   * Get the note move data (only available after execute)
   */
  public getNoteMoveData(): NoteMoveData[] {
    return [...this.noteMoveData];
  }

  /**
   * Get the target region instance (only available after execute)
   */
  public getTargetRegion(): KGMidiRegion | null {
    return this.targetRegion;
  }

  /**
   * Get the parent track instance (only available after execute)
   */
  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }

  /**
   * Factory method to create a move command from note drag parameters
   */
  public static fromNoteDrag(
    primaryNoteId: string,
    originalStartBeat: number,
    originalPitch: number,
    newStartBeat: number,
    newPitch: number,
    regionId: string,
    noteIdsToMove: string[]
  ): MoveNotesCommand {
    const startBeatDelta = newStartBeat - originalStartBeat;
    const pitchDelta = newPitch - originalPitch;
    
    return new MoveNotesCommand(
      primaryNoteId,
      startBeatDelta,
      pitchDelta,
      regionId,
      noteIdsToMove
    );
  }
}