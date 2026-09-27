import { Exclude, Expose } from 'class-transformer';
import type { KeySignature } from '../KGProject';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGKeySignatureRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGKeySignatureRegion';

  @Expose()
  private keySignature: KeySignature = 'C major';

  @Exclude()
  private barLengthTicks: number = 3840;

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    keySignature: KeySignature,
    startBar: number = 0,
    lengthBars: number = 1,
    ticksPerBar: number = 3840
  ) {
    super(id, trackId, trackIndex, keySignature, startBar * ticksPerBar, lengthBars * ticksPerBar);
    this.__type = 'KGKeySignatureRegion';
    this.keySignature = keySignature;
    this.barLengthTicks = ticksPerBar;
    super.setName(keySignature);
  }

  public getKeySignature(): KeySignature {
    return this.keySignature;
  }

  public setKeySignature(keySignature: KeySignature): void {
    this.keySignature = keySignature;
    super.setName(keySignature);
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
    super.setName(this.keySignature);
  }

  public override getCurrentType(): string {
    return 'KGKeySignatureRegion';
  }
}
