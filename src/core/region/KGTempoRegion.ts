import { Expose } from 'class-transformer';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGTempoRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGTempoRegion';

  @Expose()
  private bpm: number = 120;

  @Expose()
  private startBar: number = 0;

  @Expose()
  private lengthBars: number = 1;

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    bpm: number,
    startBar: number = 0,
    lengthBars: number = 1,
    beatsPerBar: number = 4
  ) {
    super(id, trackId, trackIndex, `${bpm} BPM`, startBar * beatsPerBar, lengthBars * beatsPerBar);
    this.__type = 'KGTempoRegion';
    this.bpm = bpm;
    this.startBar = startBar;
    this.lengthBars = lengthBars;
    this.syncBeatsFromBars(beatsPerBar);
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
    super.setName(this.getDisplayName());
  }

  public getDisplayName(): string {
    return `${this.bpm} BPM`;
  }

  public override getCurrentType(): string {
    return 'KGTempoRegion';
  }
}
