import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';

/**
 * KGRegion - Base class for regions in the DAW
 * Contains position and length information
 */
export class KGRegion implements Selectable {
  @Expose()
  protected __type: string = 'KGRegion';
  
  @Expose()
  protected id: string = '';
  
  @Expose()
  protected trackId: string = '';
  
  @Expose()
  protected trackIndex: number = 0;
  
  @Expose()
  protected name: string = '';
  
  @Expose()
  protected startFromBeat: number = 0;
  
  @Expose()
  protected length: number = 0;

  @Expose()
  protected selected: boolean = false;

  constructor(id: string, trackId: string, trackIndex: number, name: string, startFromBeat: number = 0, length: number = 0) {
    this.id = id;
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.name = name;
    this.startFromBeat = startFromBeat;
    this.length = length;

    this.selected = false;
  }

  // Getters
  public getId(): string {
    return this.id;
  }

  public getTrackId(): string {
    return this.trackId;
  }

  public getTrackIndex(): number {
    return this.trackIndex;
  }

  public getName(): string {
    return this.name;
  }

  public getStartFromBeat(): number {
    return this.startFromBeat;
  }

  public getLength(): number {
    return this.length;
  }

  // Setters
  public setId(id: string): void {
    this.id = id;
  }

  public setTrackId(trackId: string): void {
    this.trackId = trackId;
  }

  public setTrackIndex(trackIndex: number): void {
    this.trackIndex = trackIndex;
  }

  public setName(name: string): void {
    this.name = name;
  }

  public setStartFromBeat(startFromBeat: number): void {
    this.startFromBeat = startFromBeat;
  }

  public setLength(length: number): void {
    this.length = length;
  }

  // interface methods
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
    return 'KGRegion';
  }

  // Current type identification for copy/paste operations
  public getCurrentType(): string {
    return 'KGRegion';
  }
}
