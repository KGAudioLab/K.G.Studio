import { Transform } from 'class-transformer';

export function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function FXNumber(fallback: number, min: number, max: number) {
  return Transform(({ value }) => bounded(value, fallback, min, max), { toClassOnly: true });
}
export function FXBoolean(fallback: boolean) {
  return Transform(({ value }) => typeof value === 'boolean' ? value : fallback, { toClassOnly: true });
}
