import { Expose } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded, FXNumber } from './fxValidation';
import { getFXDefaults } from './fxDefaults';

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
  @FXNumber(() => getFXDefaults().compressor.thresholdDb, -100, 0)
  protected thresholdDb: number = getFXDefaults().compressor.thresholdDb;
  @Expose()
  @FXNumber(() => getFXDefaults().compressor.ratio, 1, 20)
  protected ratio: number = getFXDefaults().compressor.ratio;
  @Expose()
  @FXNumber(() => getFXDefaults().compressor.attackMs, 0, 1000)
  protected attackMs: number = getFXDefaults().compressor.attackMs;
  @Expose()
  @FXNumber(() => getFXDefaults().compressor.releaseMs, 0, 1000)
  protected releaseMs: number = getFXDefaults().compressor.releaseMs;
  @Expose()
  @FXNumber(() => getFXDefaults().compressor.gainDb, -24, 24)
  protected gainDb: number = getFXDefaults().compressor.gainDb;

  constructor(parameters: Partial<KGCompressorFXParameters> = {}, id?: string) {
    super(id); this.setParameters(parameters);
  }
  public getType(): 'compressor' { return 'compressor'; }
  public getParameters(): KGCompressorFXParameters {
    return { thresholdDb: this.thresholdDb, ratio: this.ratio, attackMs: this.attackMs, releaseMs: this.releaseMs, gainDb: this.gainDb };
  }
  public setParameters(parameters: Partial<KGCompressorFXParameters>): void {
    if ('thresholdDb' in parameters) this.thresholdDb = bounded(parameters.thresholdDb, getFXDefaults().compressor.thresholdDb, -100, 0);
    if ('ratio' in parameters) this.ratio = bounded(parameters.ratio, getFXDefaults().compressor.ratio, 1, 20);
    if ('attackMs' in parameters) this.attackMs = bounded(parameters.attackMs, getFXDefaults().compressor.attackMs, 0, 1000);
    if ('releaseMs' in parameters) this.releaseMs = bounded(parameters.releaseMs, getFXDefaults().compressor.releaseMs, 0, 1000);
    if ('gainDb' in parameters) this.gainDb = bounded(parameters.gainDb, getFXDefaults().compressor.gainDb, -24, 24);
  }
  public clone(newId = false): KGCompressorFX {
    const copy = new KGCompressorFX(this.getParameters(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
