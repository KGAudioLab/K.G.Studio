import { Expose, Transform } from 'class-transformer';
import { FXBoolean } from './fxValidation';
import { getFXDefaults } from './fxDefaults';

export type FXType = 'eq' | 'reverb' | 'compressor' | 'limiter';

/** Persisted effect settings only. Audio nodes and UI state live elsewhere. */
export abstract class KGFX {
  private static highestId = 0;

  /** Allocate max ID + 1, as track creation does, without depending on KGCore.
   * Reserve loaded IDs too; snapshots keep their identity and new effects never
   * reuse an ID held by another track or an undo snapshot in this session.
   */
  private static assignId(value?: unknown): number {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
      KGFX.highestId = Math.max(KGFX.highestId, value);
      return value;
    }
    if (KGFX.highestId >= Number.MAX_SAFE_INTEGER) throw new Error('FX ID range exhausted');
    return ++KGFX.highestId;
  }

  @Expose()
  protected __type: string = 'KGFX';

  @Expose()
  // Legacy UUIDs and missing/invalid IDs become fresh integer IDs on load.
  @Transform(({ value }) => KGFX.assignId(value), { toClassOnly: true })
  protected id: number;

  @Expose()
  @FXBoolean(() => getFXDefaults().enabled)
  protected enabled: boolean = getFXDefaults().enabled;

  constructor(id?: number) { this.id = KGFX.assignId(id); }
  public getId(): number { return this.id; }
  public getEnabled(): boolean { return this.enabled; }
  public setEnabled(enabled: boolean): void { this.enabled = typeof enabled === 'boolean' ? enabled : getFXDefaults().enabled; }
  public getRootType(): string { return 'KGFX'; }
  public getCurrentType(): string { return this.__type; }
  public abstract getType(): FXType;
  /** Copies settings; keep identity for undo, replace identity for track duplication. */
  public abstract clone(newId?: boolean): KGFX;
}
