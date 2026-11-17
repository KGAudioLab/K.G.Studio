import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';
import { toTimelineTick, type TimelineTick } from '../timing';
import { WithDefault } from '../../types/projectTypes';

// 0 = regular (sustain for strings), 1 = spiccato, 2 = pizzicato, 3 = tremolo (reserved).
export type MidiArticulation = 0 | 1 | 2 | 3;

/**
 * KGMidiNote - Class representing a MIDI note in the DAW
 * Contains note timing, pitch and volume information
 */
export class KGMidiNote implements Selectable {
  @Expose()
  private id: string = '';
  
  @Expose()
  private startTick: TimelineTick = toTimelineTick(0);
  
  @Expose()
  private endTick: TimelineTick = toTimelineTick(0);
  
  @Expose()
  private pitch: number = 0;
  
  @Expose()
  private velocity: number = 127;

  @Expose()
  @WithDefault(0)
  private articulation: MidiArticulation = 0;
  
  @Expose()
  private selected: boolean = false;

  constructor(
    id: string,
    startTick: number = 0,
    endTick: number = 0,
    pitch: number = 0,
    velocity: number = 127,
    articulation: MidiArticulation = 0,
  ) {
    this.id = id;
    this.startTick = toTimelineTick(startTick);
    this.endTick = toTimelineTick(endTick);
    this.pitch = pitch;
    this.velocity = velocity;
    this.articulation = articulation;
  }

  // Getters
  public getId(): string {
    return this.id;
  }

  public getStartTick(): TimelineTick {
    return this.startTick;
  }

  public getEndTick(): TimelineTick {
    return this.endTick;
  }

  public getPitch(): number {
    return this.pitch;
  }

  public getVelocity(): number {
    return this.velocity;
  }

  public getArticulation(): MidiArticulation {
    return this.articulation;
  }

  // Setters
  public setId(id: string): void {
    this.id = id;
  }

  public setStartTick(startTick: number): void {
    this.startTick = toTimelineTick(startTick);
  }

  public setEndTick(endTick: number): void {
    this.endTick = toTimelineTick(endTick);
  }

  public setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  public setVelocity(velocity: number): void {
    this.velocity = velocity;
  }

  public setArticulation(articulation: MidiArticulation): void {
    this.articulation = articulation;
  }
  
  // Selectable interface methods
  public select(): void {
    this.selected = true;
  }
  
  public deselect(): void {
    this.selected = false;
  }
  
  public isSelected(): boolean {
    return this.selected;
  }

  // Type identification method for performance-optimized instanceof checks
  public getRootType(): string {
    return 'KGMidiNote';
  }

  // Current type identification for copy/paste operations
  public getCurrentType(): string {
    return 'KGMidiNote';
  }
}
