import { Expose, Type } from 'class-transformer';
import { KGRegion } from './KGRegion';
import { KGMidiNote } from '../midi/KGMidiNote';

/**
 * KGMidiRegion - Class representing a MIDI region in the DAW
 * Contains MIDI notes and inherits position/length from KGRegion
 */
export class KGMidiRegion extends KGRegion {
  @Expose()
  protected override __type: string = 'KGMidiRegion';
  
  @Expose()
  @Type(() => KGMidiNote)
  protected notes: KGMidiNote[] = [];

  constructor(id: string, trackId: string, trackIndex: number, name: string, startFromBeat: number = 0, length: number = 0) {
    super(id, trackId, trackIndex, name, startFromBeat, length);
    this.__type = 'KGMidiRegion';
  }

  // Getter
  public getNotes(): KGMidiNote[] {
    return this.notes;
  }

  // Setter
  public setNotes(notes: KGMidiNote[]): void {
    this.notes = notes;
  }

  // Add a single note
  public addNote(note: KGMidiNote): void {
    this.notes.push(note);
  }

  // Remove a note by ID
  public removeNote(noteId: string): void {
    this.notes = this.notes.filter(note => note.getId() !== noteId);
  }

  // Override getCurrentType to return specific subclass type
  public override getCurrentType(): string {
    return 'KGMidiRegion';
  }
}
