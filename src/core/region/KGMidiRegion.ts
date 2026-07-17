import { Expose, Type } from 'class-transformer';
import { KGRegion } from './KGRegion';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGMidiPitchBend } from '../midi/KGMidiPitchBend';
import { KGMidiControllerEvent } from '../midi/KGMidiControllerEvent';
import { WithDefault } from '../../types/projectTypes';
import type { MidiTransposeSettings } from '../track/KGMidiTrack';

export interface FlattenedControllerEvent {
  controller: number;
  event: KGMidiControllerEvent;
}

const MIDI_CONTROLLER_COUNT = 128;

function createEmptyControllerBuckets(): KGMidiControllerEvent[][] {
  return Array.from({ length: MIDI_CONTROLLER_COUNT }, () => []);
}

function normalizeController(controller: number): number {
  return Math.max(0, Math.min(MIDI_CONTROLLER_COUNT - 1, Math.floor(controller)));
}

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
  @WithDefault(null)
  protected transposeSettingsOverride: MidiTransposeSettings | null = null;

  @Expose()
  @Type(() => KGMidiPitchBend)
  protected pitchBends: KGMidiPitchBend[] = [];

  @Expose()
  @Type(() => KGMidiControllerEvent)
  protected controllerEventsByType: KGMidiControllerEvent[][] = createEmptyControllerBuckets();

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

  public getTransposeSettingsOverride(): MidiTransposeSettings | null {
    return this.transposeSettingsOverride ? { ...this.transposeSettingsOverride } : null;
  }

  public setTransposeSettingsOverride(settings: MidiTransposeSettings | null): void {
    this.transposeSettingsOverride = settings ? { ...settings } : null;
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

  public getControllerEventsByType(): KGMidiControllerEvent[][] {
    if (!Array.isArray(this.controllerEventsByType) || this.controllerEventsByType.length !== MIDI_CONTROLLER_COUNT) {
      this.setControllerEventsByType(this.controllerEventsByType ?? []);
    }

    return this.controllerEventsByType;
  }

  public setControllerEventsByType(controllerEventsByType: KGMidiControllerEvent[][]): void {
    const normalizedBuckets = createEmptyControllerBuckets();
    if (Array.isArray(controllerEventsByType)) {
      controllerEventsByType.forEach((bucket, controller) => {
        if (controller < 0 || controller >= MIDI_CONTROLLER_COUNT || !Array.isArray(bucket)) {
          return;
        }

        normalizedBuckets[controller] = bucket;
      });
    }

    this.controllerEventsByType = normalizedBuckets;
  }

  public getControllerEvents(controller: number): KGMidiControllerEvent[] {
    return this.getControllerEventsByType()[normalizeController(controller)];
  }

  public setControllerEvents(controller: number, events: KGMidiControllerEvent[]): void {
    this.getControllerEventsByType()[normalizeController(controller)] = events ?? [];
  }

  public addControllerEvent(controller: number, event: KGMidiControllerEvent): void {
    this.getControllerEvents(controller).push(event);
  }

  public removeControllerEvent(controller: number, controllerEventId: string): void {
    this.setControllerEvents(
      controller,
      this.getControllerEvents(controller).filter(event => event.getId() !== controllerEventId)
    );
  }

  public getAllControllerEventsFlattened(): FlattenedControllerEvent[] {
    return this.getControllerEventsByType().flatMap((events, controller) => (
      events.map(event => ({ controller, event }))
    ));
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
