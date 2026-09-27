import { Exclude, Expose } from 'class-transformer';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGTempoRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGTempoRegion';

  @Expose()
  private bpm: number = 120;

  @Exclude()
  private barLengthTicks: number = 3840;

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    bpm: number,
    startBar: number = 0,
    lengthBars: number = 1,
    ticksPerBar: number = 3840
  ) {
    super(id, trackId, trackIndex, `${bpm} BPM`, startBar * ticksPerBar, lengthBars * ticksPerBar);
    this.__type = 'KGTempoRegion';
    this.bpm = bpm;
    this.barLengthTicks = ticksPerBar;
    super.setName(this.getDisplayName());
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setBpm(bpm: number): void {
    this.bpm = bpm;
    super.setName(this.getDisplayName());
  }

  public getStartBar(): number {
    return Math.floor(this.getStartTick() / this.barLengthTicks);
  }

  public getLengthBars(): number {
    return Math.max(1, Math.round(this.getLengthTicks() / this.barLengthTicks));
  }

  public getEndBar(): number {
    return this.getStartBar() + this.getLengthBars();
  }

  public setStartBar(startBar: number, ticksPerBar: number): void {
    this.barLengthTicks = ticksPerBar;
    super.setStartTick(startBar * ticksPerBar);
  }

  public setLengthBars(lengthBars: number, ticksPerBar: number): void {
    this.barLengthTicks = ticksPerBar;
    super.setLengthTicks(lengthBars * ticksPerBar);
  }

  public setBarRange(startBar: number, lengthBars: number, ticksPerBar: number): void {
    this.barLengthTicks = ticksPerBar;
    super.setStartTick(startBar * ticksPerBar);
    super.setLengthTicks(lengthBars * ticksPerBar);
  }

  public syncTicksFromBars(ticksPerBar: number): void {
    const startBar = this.getStartBar();
    const lengthBars = this.getLengthBars();
    this.setBarRange(startBar, lengthBars, ticksPerBar);
  }

  public syncBarsFromTicks(ticksPerBar: number): void {
    this.barLengthTicks = ticksPerBar;
    super.setName(this.getDisplayName());
  }

  public getDisplayName(): string {
    return `${this.bpm} BPM`;
  }

  public override getCurrentType(): string {
    return 'KGTempoRegion';
  }
}
