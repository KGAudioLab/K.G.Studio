import { Expose } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded, FXNumber } from './fxValidation';

export interface KGCompressorFXParameters {
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  gainDb: number;
}

export class KGCompressorFX extends KGFX {
  @Expose()
  protected override __type = 'KGCompressorFX';
  @Expose()
  @FXNumber(-24, -100, 0)
  protected thresholdDb: number = -24;
  @Expose()
  @FXNumber(4, 1, 20)
  protected ratio: number = 4;
  @Expose()
  @FXNumber(10, 0, 1000)
  protected attackMs: number = 10;
  @Expose()
  @FXNumber(228, 0, 1000)
  protected releaseMs: number = 228;
  @Expose()
  @FXNumber(0, -24, 24)
  protected gainDb: number = 0;

  constructor(parameters: Partial<KGCompressorFXParameters> = {}, id?: string) {
    super(id); this.setParameters(parameters);
  }
  public getType(): 'compressor' { return 'compressor'; }
  public getParameters(): KGCompressorFXParameters {
    return { thresholdDb: this.thresholdDb, ratio: this.ratio, attackMs: this.attackMs, releaseMs: this.releaseMs, gainDb: this.gainDb };
  }
  public setParameters(parameters: Partial<KGCompressorFXParameters>): void {
    if ('thresholdDb' in parameters) this.thresholdDb = bounded(parameters.thresholdDb, -24, -100, 0);
    if ('ratio' in parameters) this.ratio = bounded(parameters.ratio, 4, 1, 20);
    if ('attackMs' in parameters) this.attackMs = bounded(parameters.attackMs, 10, 0, 1000);
    if ('releaseMs' in parameters) this.releaseMs = bounded(parameters.releaseMs, 228, 0, 1000);
    if ('gainDb' in parameters) this.gainDb = bounded(parameters.gainDb, 0, -24, 24);
  }
  public clone(newId = false): KGCompressorFX {
    const copy = new KGCompressorFX(this.getParameters(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
