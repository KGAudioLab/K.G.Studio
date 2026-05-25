import { Expose } from 'class-transformer';
import { KGGlobalRegion } from './KGGlobalRegion';

export class KGChordRegion extends KGGlobalRegion {
  @Expose()
  protected override __type: string = 'KGChordRegion';

  @Expose()
  private symbol: string = 'C';

  constructor(
    id: string,
    trackId: string,
    trackIndex: number,
    symbol: string,
    startFromBeat: number = 0,
    length: number = 0
  ) {
    super(id, trackId, trackIndex, symbol, startFromBeat, length);
    this.__type = 'KGChordRegion';
    this.symbol = symbol;
    super.setName(symbol);
  }

  public getSymbol(): string {
    return this.symbol;
  }

  public setSymbol(symbol: string): void {
    this.symbol = symbol;
    super.setName(symbol);
  }

  public override getCurrentType(): string {
    return 'KGChordRegion';
  }
}
