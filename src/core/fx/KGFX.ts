import { Expose, Transform } from 'class-transformer';
import { FXBoolean } from './fxValidation';

export type FXType = 'eq' | 'reverb' | 'compressor' | 'limiter';

/** Persisted effect settings only. Audio nodes and UI state live elsewhere. */
export abstract class KGFX {
  @Expose()
  protected __type: string = 'KGFX';

  @Expose()
  @Transform(({ value }) => typeof value === 'string' && value.length ? value : crypto.randomUUID(), { toClassOnly: true })
  protected id: string;

  @Expose()
  @FXBoolean(true)
  protected enabled: boolean = true;

  constructor(id: string = crypto.randomUUID()) { this.id = id; }
  public getId(): string { return this.id; }
  public getEnabled(): boolean { return this.enabled; }
  public setEnabled(enabled: boolean): void { this.enabled = typeof enabled === 'boolean' ? enabled : true; }
  public getRootType(): string { return 'KGFX'; }
  public getCurrentType(): string { return this.__type; }
  public abstract getType(): FXType;
  /** Copies settings; keep identity for undo, replace identity for track duplication. */
  public abstract clone(newId?: boolean): KGFX;
}
