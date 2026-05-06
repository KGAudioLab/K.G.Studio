import { Expose, Type } from 'class-transformer';
import { KGRegion } from './KGRegion';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGMidiPitchBend } from '../midi/KGMidiPitchBend';

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

  @Expose()
  @Type(() => KGMidiPitchBend)
  protected pitchBends: KGMidiPitchBend[] = [];

  constructor(id: string, trackId: string, trackIndex: number, name: string, startFromBeat: number = 0, length: number = 0) {
    super(id, trackId, trackIndex, name, startFromBeat, length);
    this.__type = 'KGMidiRegion';
  }

  // Getter
  public getNotes(): KGMidiNote[] {
    if (!this.notes) {
      this.notes = [];
    }
    return this.notes;
  }

  // Setter
  public setNotes(notes: KGMidiNote[]): void {
    this.notes = notes ?? [];
  }

  public getPitchBends(): KGMidiPitchBend[] {
    if (!this.pitchBends) {
      this.pitchBends = [];
    }
    return this.pitchBends;
  }

  public setPitchBends(pitchBends: KGMidiPitchBend[]): void {
    this.pitchBends = pitchBends ?? [];
  }

  // Add a single note
  public addNote(note: KGMidiNote): void {
    this.getNotes().push(note);
  }

  // Remove a note by ID
  public removeNote(noteId: string): void {
    this.notes = this.getNotes().filter(note => note.getId() !== noteId);
  }

  public addPitchBend(pitchBend: KGMidiPitchBend): void {
    this.getPitchBends().push(pitchBend);
  }

  public removePitchBend(pitchBendId: string): void {
    this.pitchBends = this.getPitchBends().filter(pitchBend => pitchBend.getId() !== pitchBendId);
  }

  // Override getCurrentType to return specific subclass type
  public override getCurrentType(): string {
    return 'KGMidiRegion';
  }
}
