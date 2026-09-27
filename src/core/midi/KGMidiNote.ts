import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';
import { toTimelineTick, type TimelineTick } from '../timing';

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
  private selected: boolean = false;

  constructor(id: string, startTick: number = 0, endTick: number = 0, pitch: number = 0, velocity: number = 127) {
    this.id = id;
    this.startTick = toTimelineTick(startTick);
    this.endTick = toTimelineTick(endTick);
    this.pitch = pitch;
    this.velocity = velocity;
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
