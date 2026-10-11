import { Expose } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded, FXNumber } from './fxValidation';
import { getFXDefaults } from './fxDefaults';

export interface KGLimiterFXParameters {
  inputGainDb: number;
  thresholdDb: number;
}

export class KGLimiterFX extends KGFX {
  @Expose()
  protected override __type = 'KGLimiterFX';
  @Expose()
  @FXNumber(() => getFXDefaults().limiter.inputGainDb, -24, 24)
  protected inputGainDb: number = getFXDefaults().limiter.inputGainDb;
  @Expose()
  @FXNumber(() => getFXDefaults().limiter.thresholdDb, -100, 0)
  protected thresholdDb: number = getFXDefaults().limiter.thresholdDb;

  constructor(parameters: Partial<KGLimiterFXParameters> = {}, id?: number) {
    super(id); this.setParameters(parameters);
  }
  public getType(): 'limiter' { return 'limiter'; }
  public getParameters(): KGLimiterFXParameters {
    return { inputGainDb: this.inputGainDb, thresholdDb: this.thresholdDb };
  }
  public setParameters(parameters: Partial<KGLimiterFXParameters>): void {
    if ('inputGainDb' in parameters) this.inputGainDb = bounded(parameters.inputGainDb, getFXDefaults().limiter.inputGainDb, -24, 24);
    if ('thresholdDb' in parameters) this.thresholdDb = bounded(parameters.thresholdDb, getFXDefaults().limiter.thresholdDb, -100, 0);
  }
  public clone(newId = false): KGLimiterFX {
    const copy = new KGLimiterFX(this.getParameters(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
