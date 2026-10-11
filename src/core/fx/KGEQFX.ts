import { Expose, Transform } from 'class-transformer';
import { KGFX } from './KGFX';
import { bounded } from './fxValidation';
import { getFXDefaults } from './fxDefaults';

export interface KGEQBand { frequencyHz: number; q: number; gainDb: number }
export const EQ_BAND_TYPES = ['lowshelf', 'peaking', 'highshelf'] as const;
export type EQBandType = typeof EQ_BAND_TYPES[number];
export const EQ_MIN_FREQUENCY_HZ = 20;
export const EQ_MAX_FREQUENCY_HZ = 20000;
// Keep band identities in strict frequency order without swapping bands.
export const EQ_BAND_GAP_HZ = 1;
export function clampEQBandFrequency(frequencies: readonly number[], index: number, value: number): number {
  const min = index === 0 ? EQ_MIN_FREQUENCY_HZ : frequencies[index - 1] + EQ_BAND_GAP_HZ;
  const max = index === frequencies.length - 1 ? EQ_MAX_FREQUENCY_HZ : frequencies[index + 1] - EQ_BAND_GAP_HZ;
  return bounded(value, frequencies[index], min, max);
}
export function normalizeEQBands(value: unknown): KGEQBand[] {
  const bands = Array.isArray(value) ? value : [];
  const defaults = getFXDefaults().eq.bands;
  const normalized = defaults.map((defaultBand, index) => {
    const band = bands[index] && typeof bands[index] === 'object' ? bands[index] : {};
    return { frequencyHz: bounded(band.frequencyHz, defaultBand.frequencyHz, 20, 20000),
      q: bounded(band.q, defaultBand.q, 0.1, 10), gainDb: bounded(band.gainDb, defaultBand.gainDb, -18, 18) };
  });
  // Normalize older/unordered saved data without moving gain or Q between bands.
  for (let index = normalized.length - 1; index >= 0; index--) {
    const min = EQ_MIN_FREQUENCY_HZ + index * EQ_BAND_GAP_HZ;
    const max = index === normalized.length - 1 ? EQ_MAX_FREQUENCY_HZ : normalized[index + 1].frequencyHz - EQ_BAND_GAP_HZ;
    normalized[index].frequencyHz = bounded(normalized[index].frequencyHz, defaults[index].frequencyHz, min, max);
  }
  return normalized;
}
export class KGEQFX extends KGFX {
  @Expose()
  protected override __type = 'KGEQFX';
  @Expose()
  @Transform(({ value }) => normalizeEQBands(value), { toClassOnly: true })
  protected bands: KGEQBand[] = normalizeEQBands(undefined);

  constructor(bands?: KGEQBand[], id?: number) { super(id); this.setBands(bands ?? this.bands); }
  public getType(): 'eq' { return 'eq'; }
  public getBandType(index: number): EQBandType {
    const type = EQ_BAND_TYPES[index];
    if (!type) throw new RangeError('Invalid EQ band index');
    return type;
  }
  public getBands(): KGEQBand[] { return this.bands.map(band => ({ ...band })); }
  public setBands(bands: KGEQBand[]): void { this.bands = normalizeEQBands(bands); }
  public clone(newId = false): KGEQFX {
    const copy = new KGEQFX(this.getBands(), newId ? undefined : this.id);
    copy.setEnabled(this.enabled); return copy;
  }
}
