import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';

export class KGMidiPitchBend implements Selectable {
  @Expose()
  private id: string = '';

  @Expose()
  private beat: number = 0;

  @Expose()
  private value: number = 8192;

  @Expose()
  private selected: boolean = false;

  constructor(id: string, beat: number = 0, value: number = 8192) {
    this.id = id;
    this.beat = beat;
    this.value = value;
  }

  public getId(): string {
    return this.id;
  }

  public getBeat(): number {
    return this.beat;
  }

  public getValue(): number {
    return this.value;
  }

  public setId(id: string): void {
    this.id = id;
  }

  public setBeat(beat: number): void {
    this.beat = beat;
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
    return 'KGMidiPitchBend';
  }

  public getCurrentType(): string {
    return 'KGMidiPitchBend';
  }
}
