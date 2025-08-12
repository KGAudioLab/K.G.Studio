import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { generateUniqueId } from '../../../util/miscUtil';

/**
 * Command to create a new MIDI note in a region
 * Handles both the core model update and provides undo functionality
 */
export class CreateNoteCommand extends KGCommand {
  private regionId: string;
  private noteId: string;  
  private startBeat: number;
  private endBeat: number;
  private pitch: number;
  private velocity: number;
  private createdNote: KGMidiNote | null = null;

  constructor(
    regionId: string,
    startBeat: number,
    endBeat: number,
    pitch: number,
    velocity: number = 127,
    noteId?: string
  ) {
    super();
    this.regionId = regionId;
    this.startBeat = startBeat;
    this.endBeat = endBeat;
    this.pitch = pitch;
    this.velocity = velocity;
    this.noteId = noteId || generateUniqueId('KGMidiNote');
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region that contains this note
    let targetRegion: KGMidiRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region && region instanceof KGMidiRegion) {
        targetRegion = region;
        break;
      }
    }

    if (!targetRegion) {
      throw new Error(`MIDI region with ID ${this.regionId} not found`);
    }

    // Create the new MIDI note
    this.createdNote = new KGMidiNote(
      this.noteId,
      this.startBeat,
      this.endBeat,
      this.pitch,
      this.velocity
    );

    // Add the note to the region
    targetRegion.addNote(this.createdNote);

    console.log(`Created note in region ${this.regionId}: pitch=${this.pitch}, start=${this.startBeat}, end=${this.endBeat}`);
  }

  undo(): void {
    if (!this.createdNote) {
      throw new Error('Cannot undo: no note was created');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region that contains this note
    let targetRegion: KGMidiRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region && region instanceof KGMidiRegion) {
        targetRegion = region;
        break;
      }
    }

    if (!targetRegion) {
      throw new Error(`MIDI region with ID ${this.regionId} not found during undo`);
    }

    // Remove the note from the region
    targetRegion.removeNote(this.noteId);

    console.log(`Removed note from region ${this.regionId}: pitch=${this.pitch}`);
  }

  getDescription(): string {
    // Convert MIDI pitch to note name for user-friendly description
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(this.pitch / 12) - 1;
    const noteName = noteNames[this.pitch % 12];
    return `Create note ${noteName}${octave}`;
  }

  /**
   * Get the ID of the note that was/will be created
   */
  public getNoteId(): string {
    return this.noteId;
  }

  /**
   * Get the created note instance (only available after execute)
   */
  public getCreatedNote(): KGMidiNote | null {
    return this.createdNote;
  }

  /**
   * Get the region ID where the note was/will be created
   */
  public getRegionId(): string {
    return this.regionId;
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