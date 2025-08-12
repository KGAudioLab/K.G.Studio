import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

/**
 * Interface for storing resize data for each note
 */
interface NoteResizeData {
  noteId: string;
  originalStartBeat: number;
  originalEndBeat: number;
  newStartBeat: number;
  newEndBeat: number;
}

/**
 * Command to resize multiple notes simultaneously
 * Handles resizing notes from either start or end edge with delta application
 */
export class ResizeNotesCommand extends KGCommand {
  private primaryNoteId: string;
  private resizeEdge: 'start' | 'end';
  private primaryStartBeatDelta: number;
  private primaryEndBeatDelta: number;
  private regionId: string;
  private noteIdsToResize: string[]; // Store the specific note IDs to resize
  private noteResizeData: NoteResizeData[] = [];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(
    primaryNoteId: string,
    resizeEdge: 'start' | 'end',
    primaryStartBeatDelta: number,
    primaryEndBeatDelta: number,
    regionId: string,
    noteIdsToResize: string[]
  ) {
    super();
    this.primaryNoteId = primaryNoteId;
    this.resizeEdge = resizeEdge;
    this.primaryStartBeatDelta = primaryStartBeatDelta;
    this.primaryEndBeatDelta = primaryEndBeatDelta;
    this.regionId = regionId;
    this.noteIdsToResize = [...noteIdsToResize]; // Create a copy to avoid reference issues
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

    // Clear any existing resize data (for re-execution)
    this.noteResizeData = [];

    // Find all notes to resize based on the stored note IDs
    const notesToResize = this.noteIdsToResize
      .map(noteId => targetRegion.getNotes().find(n => n.getId() === noteId))
      .filter(note => note !== undefined) as KGMidiNote[];

    if (notesToResize.length === 0) {
      throw new Error(`No notes found to resize from the provided note IDs`);
    }

    // Verify the primary note is included
    const primaryNote = notesToResize.find(n => n.getId() === this.primaryNoteId);
    if (!primaryNote) {
      throw new Error(`Primary note with ID ${this.primaryNoteId} not found in notes to resize`);
    }

    // Store original positions and calculate new positions
    notesToResize.forEach(note => {
      const originalStartBeat = note.getStartBeat();
      const originalEndBeat = note.getEndBeat();
      let newStartBeat = originalStartBeat;
      let newEndBeat = originalEndBeat;

      if (note.getId() === this.primaryNoteId) {
        // Primary note: apply the exact deltas
        newStartBeat = originalStartBeat + this.primaryStartBeatDelta;
        newEndBeat = originalEndBeat + this.primaryEndBeatDelta;
      } else {
        // Other selected notes: apply the same delta as primary note
        if (this.resizeEdge === 'start') {
          newStartBeat = originalStartBeat + this.primaryStartBeatDelta;
          // End beat stays the same for start resize
        } else if (this.resizeEdge === 'end') {
          newEndBeat = originalEndBeat + this.primaryEndBeatDelta;
          // Start beat stays the same for end resize
        }
      }

      // Store resize data for undo
      this.noteResizeData.push({
        noteId: note.getId(),
        originalStartBeat,
        originalEndBeat,
        newStartBeat,
        newEndBeat
      });
    });

    // Apply all the resize operations
    this.noteResizeData.forEach(data => {
      const note = targetRegion.getNotes().find(n => n.getId() === data.noteId);
      if (note) {
        note.setStartBeat(data.newStartBeat);
        note.setEndBeat(data.newEndBeat);
      }
    });

    console.log(`Resized ${this.noteResizeData.length} notes (edge: ${this.resizeEdge}, primary note: ${this.primaryNoteId})`);
  }

  undo(): void {
    if (!this.targetRegion || this.noteResizeData.length === 0) {
      throw new Error('Cannot undo: no notes were resized');
    }

    // Restore all notes to their original positions
    this.noteResizeData.forEach(data => {
      const note = this.targetRegion!.getNotes().find(n => n.getId() === data.noteId);
      if (note) {
        note.setStartBeat(data.originalStartBeat);
        note.setEndBeat(data.originalEndBeat);
      }
    });

    console.log(`Restored ${this.noteResizeData.length} notes to their original positions`);
  }

  getDescription(): string {
    const noteCount = this.noteResizeData.length;
    const edgeText = this.resizeEdge === 'start' ? 'start' : 'end';
    
    if (noteCount === 1) {
      return `Resize note from ${edgeText}`;
    } else {
      return `Resize ${noteCount} notes from ${edgeText}`;
    }
  }

  /**
   * Get the primary note ID
   */
  public getPrimaryNoteId(): string {
    return this.primaryNoteId;
  }

  /**
   * Get the resize edge
   */
  public getResizeEdge(): 'start' | 'end' {
    return this.resizeEdge;
  }

  /**
   * Get the region ID
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the note resize data (only available after execute)
   */
  public getNoteResizeData(): NoteResizeData[] {
    return [...this.noteResizeData];
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
   * Factory method to create a resize command from note resize parameters
   */
  public static fromNoteResize(
    primaryNoteId: string,
    resizeEdge: 'start' | 'end',
    originalStartBeat: number,
    originalEndBeat: number,
    newStartBeat: number,
    newEndBeat: number,
    regionId: string,
    noteIdsToResize: string[]
  ): ResizeNotesCommand {
    const startBeatDelta = newStartBeat - originalStartBeat;
    const endBeatDelta = newEndBeat - originalEndBeat;
    
    return new ResizeNotesCommand(
      primaryNoteId,
      resizeEdge,
      startBeatDelta,
      endBeatDelta,
      regionId,
      noteIdsToResize
    );
  }

  /**
   * Get the note IDs that will be resized
   */
  public getNoteIdsToResize(): string[] {
    return [...this.noteIdsToResize];
  }
}