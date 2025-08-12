import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';

/**
 * KGMidiNote - Class representing a MIDI note in the DAW
 * Contains note timing, pitch and volume information
 */
export class KGMidiNote implements Selectable {
  @Expose()
  private id: string = '';
  
  @Expose()
  private startBeat: number = 0;
  
  @Expose()
  private endBeat: number = 0;
  
  @Expose()
  private pitch: number = 0;
  
  @Expose()
  private velocity: number = 127;
  
  @Expose()
  private selected: boolean = false;

  constructor(id: string, startBeat: number = 0, endBeat: number = 0, pitch: number = 0, velocity: number = 127) {
    this.id = id;
    this.startBeat = startBeat;
    this.endBeat = endBeat;
    this.pitch = pitch;
    this.velocity = velocity;
  }

  // Getters
  public getId(): string {
    return this.id;
  }

  public getStartBeat(): number {
    return this.startBeat;
  }

  public getEndBeat(): number {
    return this.endBeat;
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

  public setStartBeat(startBeat: number): void {
    this.startBeat = startBeat;
  }

  public setEndBeat(endBeat: number): void {
    this.endBeat = endBeat;
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
