import { Expose, Transform } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded } from './fxValidation';

export interface KGEQBand { frequencyHz: number; q: number; gainDb: number }
const FREQUENCIES = [200, 1350, 6500];
export function normalizeEQBands(value: unknown): KGEQBand[] {
  const bands = Array.isArray(value) ? value : [];
  return FREQUENCIES.map((frequency, index) => {
    const band = bands[index] && typeof bands[index] === 'object' ? bands[index] : {};
    return { frequencyHz: bounded(band.frequencyHz, frequency, 20, 20000),
      q: bounded(band.q, 0.5, 0.1, 10), gainDb: bounded(band.gainDb, 0, -18, 18) };
  });
}
export class KGEQFX extends KGFX {
  @Expose()
  protected override __type = 'KGEQFX';
  @Expose()
  @Transform(({ value }) => normalizeEQBands(value), { toClassOnly: true })
  protected bands: KGEQBand[] = normalizeEQBands(undefined);

  constructor(bands?: KGEQBand[], id?: string) { super(id); this.setBands(bands ?? this.bands); }
  public getType(): 'eq' { return 'eq'; }
  public getBands(): KGEQBand[] { return this.bands.map(band => ({ ...band })); }
  public setBands(bands: KGEQBand[]): void { this.bands = normalizeEQBands(bands); }
  public clone(newId = false): KGEQFX {
    const copy = new KGEQFX(this.getBands(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
