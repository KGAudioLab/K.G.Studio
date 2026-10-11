import { Expose, Transform } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded, FXNumber } from './fxValidation';
import { getFXDefaults } from './fxDefaults';

export const REVERB_TYPES = ['hall', 'room', 'chamber', 'plate', 'spring'] as const;
export type ReverbType = typeof REVERB_TYPES[number];
function normalizeType(value: unknown): ReverbType {
  return REVERB_TYPES.includes(value as ReverbType) ? value as ReverbType : getFXDefaults().reverb.reverbType;
}
export class KGReverbFX extends KGFX {
  @Expose()
  protected override __type = 'KGReverbFX';
  @Expose()
  @Transform(({ value }) => normalizeType(value), { toClassOnly: true })
  protected reverbType: ReverbType = getFXDefaults().reverb.reverbType;
  @Expose()
  @FXNumber(() => getFXDefaults().reverb.wet, 0, 1)
  protected wet: number = getFXDefaults().reverb.wet;

  constructor(reverbType: ReverbType = getFXDefaults().reverb.reverbType, wet = getFXDefaults().reverb.wet, id?: string) {
    super(id); this.setReverbType(reverbType); this.setWet(wet);
  }
  public getType(): 'reverb' { return 'reverb'; }
  public getReverbType(): ReverbType { return this.reverbType; }
  public setReverbType(value: ReverbType): void { this.reverbType = normalizeType(value); }
  public getWet(): number { return this.wet; }
  public setWet(value: number): void { this.wet = bounded(value, getFXDefaults().reverb.wet, 0, 1); }
  public clone(newId = false): KGReverbFX {
    const copy = new KGReverbFX(this.reverbType, this.wet, newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
