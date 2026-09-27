import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';
import { toTimelineTick, type TimelineTick } from '../timing';

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
  protected startTick: TimelineTick = toTimelineTick(0);
  
  @Expose()
  protected lengthTicks: TimelineTick = toTimelineTick(0);

  @Expose()
  protected color?: string;

  @Expose()
  protected selected: boolean = false;

  constructor(id: string, trackId: string, trackIndex: number, name: string, startTick: number = 0, length: number = 0) {
    this.id = id;
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.name = name;
    this.startTick = toTimelineTick(startTick);
    this.lengthTicks = toTimelineTick(length);

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

  public getStartTick(): TimelineTick {
    return this.startTick;
  }

  public getLengthTicks(): TimelineTick {
    return this.lengthTicks;
  }

  public getColor(): string | undefined {
    return this.color;
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

  public setStartTick(startTick: number): void {
    this.startTick = toTimelineTick(startTick);
  }

  public setLengthTicks(lengthTicks: number): void {
    this.lengthTicks = toTimelineTick(lengthTicks);
  }

  public setColor(color: string | undefined): void {
    this.color = color;
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
