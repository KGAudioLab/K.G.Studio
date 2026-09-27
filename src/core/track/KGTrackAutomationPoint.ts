import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';
import { toTimelineTick, type TimelineTick } from '../timing';

export type TrackAutomationType = 'volume' | 'pan';

export class KGTrackAutomationPoint implements Selectable {
  @Expose()
  private id: string = '';

  @Expose()
  private tick: TimelineTick = toTimelineTick(0);

  @Expose()
  private value: number = 0;

  @Expose()
  private selected: boolean = false;

  constructor(id: string, tick: number = 0, value: number = 0) {
    this.id = id;
    this.tick = toTimelineTick(tick);
    this.value = value;
  }

  public getId(): string {
    return this.id;
  }

  public getTick(): TimelineTick {
    return this.tick;
  }

  public getValue(): number {
    return this.value;
  }

  public setId(id: string): void {
    this.id = id;
  }

  public setTick(tick: number): void {
    this.tick = toTimelineTick(tick);
  }

  public setValue(value: number): void {
    this.value = value;
  }

  public select(): void {
    this.selected = true;
  }

  public deselect(): void {
    this.selected = false;
  }

  public isSelected(): boolean {
    return this.selected;
  }

  public getRootType(): string {
    return 'KGTrackAutomationPoint';
  }

  public getCurrentType(): string {
    return 'KGTrackAutomationPoint';
  }
}
