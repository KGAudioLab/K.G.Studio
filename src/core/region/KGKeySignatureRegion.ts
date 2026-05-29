import { Expose } from 'class-transformer';
import type { KeySignature } from '../KGProject';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGKeySignatureRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGKeySignatureRegion';

  @Expose()
  private keySignature: KeySignature = 'C major';

  @Expose()
  private startBar: number = 0;

  @Expose()
  private lengthBars: number = 1;

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    keySignature: KeySignature,
    startBar: number = 0,
    lengthBars: number = 1,
    beatsPerBar: number = 4
  ) {
    super(id, trackId, trackIndex, keySignature, startBar * beatsPerBar, lengthBars * beatsPerBar);
    this.__type = 'KGKeySignatureRegion';
    this.keySignature = keySignature;
    this.startBar = startBar;
    this.lengthBars = lengthBars;
    this.syncBeatsFromBars(beatsPerBar);
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
    return this.startBar;
  }

  public getLengthBars(): number {
    return this.lengthBars;
  }

  public getEndBar(): number {
    return this.startBar + this.lengthBars;
  }

  public setStartBar(startBar: number, beatsPerBar: number): void {
    this.startBar = startBar;
    this.syncBeatsFromBars(beatsPerBar);
  }

  public setLengthBars(lengthBars: number, beatsPerBar: number): void {
    this.lengthBars = lengthBars;
    this.syncBeatsFromBars(beatsPerBar);
  }

  public setBarRange(startBar: number, lengthBars: number, beatsPerBar: number): void {
    this.startBar = startBar;
    this.lengthBars = lengthBars;
    this.syncBeatsFromBars(beatsPerBar);
  }

  public syncBeatsFromBars(beatsPerBar: number): void {
    super.setStartFromBeat(this.startBar * beatsPerBar);
    super.setLength(this.lengthBars * beatsPerBar);
  }

  public syncBarsFromBeats(beatsPerBar: number): void {
    this.startBar = Math.floor(this.getStartFromBeat() / beatsPerBar);
    this.lengthBars = Math.max(1, Math.round(this.getLength() / beatsPerBar));
    super.setName(this.keySignature);
  }

  public override getCurrentType(): string {
    return 'KGKeySignatureRegion';
  }
}
