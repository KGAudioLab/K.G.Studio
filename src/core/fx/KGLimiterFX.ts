import { Expose } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded, FXNumber } from './fxValidation';

export interface KGLimiterFXParameters {
  inputGainDb: number;
  thresholdDb: number;
}

export class KGLimiterFX extends KGFX {
  @Expose()
  protected override __type = 'KGLimiterFX';
  @Expose()
  @FXNumber(0, -24, 24)
  protected inputGainDb: number = 0;
  @Expose()
  @FXNumber(-4.1, -100, 0)
  protected thresholdDb: number = -4.1;

  constructor(parameters: Partial<KGLimiterFXParameters> = {}, id?: string) {
    super(id); this.setParameters(parameters);
  }
  public getType(): 'limiter' { return 'limiter'; }
  public getParameters(): KGLimiterFXParameters {
    return { inputGainDb: this.inputGainDb, thresholdDb: this.thresholdDb };
  }
  public setParameters(parameters: Partial<KGLimiterFXParameters>): void {
    if ('inputGainDb' in parameters) this.inputGainDb = bounded(parameters.inputGainDb, 0, -24, 24);
    if ('thresholdDb' in parameters) this.thresholdDb = bounded(parameters.thresholdDb, -4.1, -100, 0);
  }
  public clone(newId = false): KGLimiterFX {
    const copy = new KGLimiterFX(this.getParameters(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
