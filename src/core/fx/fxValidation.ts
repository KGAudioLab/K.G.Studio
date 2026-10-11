import { Transform } from 'class-transformer';

export function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function FXNumber(fallback: number | (() => number), min: number, max: number) {
  return Transform(({ value }) => bounded(value, typeof fallback === 'function' ? fallback() : fallback, min, max), { toClassOnly: true });
}
export function FXBoolean(fallback: boolean | (() => boolean)) {
  return Transform(({ value }) => typeof value === 'boolean' ? value : typeof fallback === 'function' ? fallback() : fallback, { toClassOnly: true });
}
