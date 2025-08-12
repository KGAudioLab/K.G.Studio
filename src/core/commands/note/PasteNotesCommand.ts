import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';
import { generateUniqueId } from '../../../util/miscUtil';

/**
 * Interface for storing created note data for undo
 */
interface CreatedNoteData {
  noteId: string;
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
}

/**
 * Command to paste notes to a target region
 * Handles creating new notes with new IDs and maintaining relative positions
 */
export class PasteNotesCommand extends KGCommand {
  private regionId: string;
  private pastePosition: number;
  private sourceNotes: KGMidiNote[];
  private createdNotes: CreatedNoteData[] = [];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, pastePosition: number, sourceNotes: KGMidiNote[]) {
    super();
    this.regionId = regionId;
    this.pastePosition = pastePosition;
    this.sourceNotes = [...sourceNotes]; // Create a copy to avoid reference issues
  }

  execute(): void {
    if (this.sourceNotes.length === 0) {
      throw new Error('No notes to paste');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the target region
    let targetRegion: KGMidiRegion | null = null;
    let parentTrack: KGTrack | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region && region instanceof KGMidiRegion) {
        targetRegion = region;
        parentTrack = track;
        break;
      }
    }

    if (!targetRegion || !parentTrack) {
      throw new Error(`Target MIDI region with ID ${this.regionId} not found`);
    }

    this.targetRegion = targetRegion;
    this.parentTrack = parentTrack;

    // Clear any previously created notes (for re-execution)
    this.createdNotes = [];

    // Calculate relative position within the region
    const relativeStartPosition = this.pastePosition - targetRegion.getStartFromBeat();
    
    // Calculate the base position from the first note to maintain relative positions
    const basePosition = this.sourceNotes[0].getStartBeat();

    // Create new notes at the target position
    this.sourceNotes.forEach((originalNote) => {
      // Generate new ID for the pasted note
      const newId = generateUniqueId('KGMidiNote');
      
      // Calculate new position maintaining relative offset
      const noteOffset = originalNote.getStartBeat() - basePosition;
      const newStartBeat = relativeStartPosition + noteOffset;
      const duration = originalNote.getEndBeat() - originalNote.getStartBeat();
      const newEndBeat = newStartBeat + duration;
      
      // Create a copy of the note with new position and ID
      const newNote = new KGMidiNote(
        newId,
        newStartBeat,
        newEndBeat,
        originalNote.getPitch(),
        originalNote.getVelocity()
      );
      
      // Store created note data for undo
      this.createdNotes.push({
        noteId: newId,
        startBeat: newStartBeat,
        endBeat: newEndBeat,
        pitch: originalNote.getPitch(),
        velocity: originalNote.getVelocity()
      });
      
      // Add the new note to the target region
      targetRegion.addNote(newNote);
    });
    
    console.log(`Pasted ${this.sourceNotes.length} notes to region ${this.regionId} at position ${this.pastePosition}`);
    console.log(`Region now has ${targetRegion.getNotes().length} notes total`);
  }

  undo(): void {
    if (!this.targetRegion || this.createdNotes.length === 0) {
      throw new Error('Cannot undo: no notes were pasted');
    }

    // Remove all created notes from the target region
    const currentNotes = this.targetRegion.getNotes();
    const noteIdsToRemove = new Set(this.createdNotes.map(data => data.noteId));
    
    const filteredNotes = currentNotes.filter(note => !noteIdsToRemove.has(note.getId()));
    this.targetRegion.setNotes(filteredNotes);
    
    console.log(`Removed ${this.createdNotes.length} pasted notes from region ${this.regionId}`);
    console.log(`Region now has ${this.targetRegion.getNotes().length} notes total`);
  }

  getDescription(): string {
    const noteCount = this.sourceNotes.length;
    const regionName = this.targetRegion ? this.targetRegion.getName() : `Region ${this.regionId}`;
    
    if (noteCount === 1) {
      return `Paste note to "${regionName}"`;
    } else {
      return `Paste ${noteCount} notes to "${regionName}"`;
    }
  }

  /**
   * Get the target region ID
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the paste position
   */
  public getPastePosition(): number {
    return this.pastePosition;
  }

  /**
   * Get the source notes being pasted
   */
  public getSourceNotes(): KGMidiNote[] {
    return [...this.sourceNotes];
  }

  /**
   * Get the created note data (only available after execute)
   */
  public getCreatedNotes(): CreatedNoteData[] {
    return [...this.createdNotes];
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
   * Factory method to create a paste command from the clipboard
   */
  public static fromClipboard(regionId: string, pastePosition: number): PasteNotesCommand | null {
    const core = KGCore.instance();
    const copiedItems = core.getCopiedItems();
    const notesToCreate = copiedItems.filter(item => item instanceof KGMidiNote) as KGMidiNote[];
    
    if (notesToCreate.length === 0) {
      return null;
    }
    
    return new PasteNotesCommand(regionId, pastePosition, notesToCreate);
  }

  /**
   * Factory method to create a paste command from specific notes
   */
  public static fromNotes(regionId: string, pastePosition: number, notes: KGMidiNote[]): PasteNotesCommand {
    return new PasteNotesCommand(regionId, pastePosition, notes);
  }
}