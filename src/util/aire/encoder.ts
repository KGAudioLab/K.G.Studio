// Adapted from instrument-aire-models/inference/encoder.mjs.
// Copyright (c) 2026 xiaohan-tian / KGAudioLab. See ./LICENSE.
import { AIRE_MODELS } from './config';
import type { AireOptions, AireSection } from './types';
export const AIRE_RATE = 16;
export const AIRE_MAX_FRAMES = 2048;
export const AIRE_HOP = 1024;
type TensorData = Float32Array | BigInt64Array | Uint8Array;
export interface AireTensor { type: 'float32' | 'int64' | 'bool'; data: TensorData; dims: number[] }
const cap = (x: number, k: number) => Math.min(Math.max(x, 0), k) / k;
export function aireWindows(frameCount: number): { start: number; length: number }[] {
  if (!Number.isSafeInteger(frameCount) || frameCount < 0) throw new Error('Invalid AIRE frame count.');
  const result = [];
  for (let start = 0; start < frameCount; start += AIRE_HOP) {
    const length = Math.min(AIRE_MAX_FRAMES, frameCount - start);
    result.push({ start, length });
    if (start + length === frameCount) break;
  }
  return result;
}
export function encodeAireWindow(section: AireSection, options: AireOptions, start: number, length: number): Record<string, AireTensor> {
  const categories = AIRE_MODELS[options.modelId];
  const mood = categories?.moods.indexOf(options.mood), role = categories?.roles.indexOf(options.role);
  const { notes, tempo, meter: [num, den], hardEnd } = section;
  if (!categories || mood < 0 || role < 0 || !Number.isFinite(tempo) || tempo <= 0 ||
      !Number.isInteger(num) || num <= 0 || !Number.isInteger(den) || den <= 0 || !Number.isInteger(Math.log2(den)) ||
      !Number.isFinite(section.originBeat) || !Number.isFinite(hardEnd) || hardEnd < 0 ||
      !Number.isInteger(start) || start < 0 || !Number.isInteger(length) || length < 1 || length > AIRE_MAX_FRAMES || start + length > Math.ceil(hardEnd * AIRE_RATE)) {
    throw new Error('Invalid AIRE encoding request.');
  }
  for (const n of notes) {
    if (!Number.isInteger(n.pitch) || n.pitch < 0 || n.pitch > 127 || !Number.isFinite(n.start) || !Number.isFinite(n.end) || n.end <= n.start ||
        !Number.isInteger(n.velocity) || n.velocity < 1 || n.velocity > 127) throw new Error('Invalid sounding MIDI note.');
  }
  const enabled = (options.useVelocity ?? true) && new Set(notes.map(n => n.velocity)).size > 1;
  const noteEnd = notes.reduce((v, n) => Math.max(v, n.end), 0);
  const features = new Float32Array(length * 25);
  const rolls = Array.from({ length: 3 }, () => new Float32Array(length * 128));
  const lead = new BigInt64Array(length).fill(128n);
  const onsets = [...new Set(notes.map(n => n.start))].sort((a, b) => a - b);
  const representatives = new Map<number, number>();
  for (const n of notes) representatives.set(n.start, Math.max(representatives.get(n.start) ?? -1, n.pitch));
  const group = new Map(onsets.map((s, i) => [s, i]));
  const barLength = num * 4 / den;
  for (let i = 0; i < length; i++) {
    const t = (start + i) / AIRE_RATE, end = Math.min((start + i + 1) / AIRE_RATE, hardEnd);
    const active = notes.filter(n => n.start <= t && t < n.end);
    const starts = notes.filter(n => t <= n.start && n.start < end);
    const stops = notes.filter(n => t <= n.end && n.end < end);
    [active, starts, stops].forEach((events, j) => { for (const n of events) rolls[j][i * 128 + n.pitch] += 1; });
    const f = features.subarray(i * 25, (i + 1) * 25);
    f[0] = Number(active.length > 0); f[1] = Number(starts.length > 0); f[2] = Number(stops.length > 0);
    if (active.length) {
      const n = active.reduce((best, v) => v.start > best.start || v.start === best.start && v.pitch > best.pitch ? v : best);
      lead[i] = BigInt(n.pitch);
      const g = group.get(n.start)!;
      f.set([enabled ? n.velocity / 127 : 0, cap(t - n.start, 8), cap(n.end - t, 8), cap(n.end - n.start, 8),
        (t - n.start) / (n.end - n.start), g ? (n.pitch - representatives.get(onsets[g - 1])!) / 12 : 0,
        g + 1 < onsets.length ? (representatives.get(onsets[g + 1])! - n.pitch) / 12 : 0], 3);
      f[16] = active.length / 4;
      f[17] = (Math.max(...active.map(n => n.pitch)) - Math.min(...active.map(n => n.pitch))) / 24;
    } else {
      const previous = notes.filter(n => n.end <= t), following = notes.filter(n => n.start > t);
      f[10] = previous.length ? cap(t - Math.max(...previous.map(n => n.end)), 8) : 0;
      f[11] = following.length ? cap(Math.min(...following.map(n => n.start)) - t, 8) : 0;
    }
    const absoluteBeat = t + section.originBeat;
    f.set([Math.sin(2 * Math.PI * absoluteBeat), Math.cos(2 * Math.PI * absoluteBeat),
      Math.sin(2 * Math.PI * absoluteBeat / barLength), Math.cos(2 * Math.PI * absoluteBeat / barLength)], 12);
    f.set([cap(t, 16), cap(noteEnd - t, 16), cap(hardEnd - t, 16)], 18);
    if (starts.length) {
      f[21] = (Math.min(...starts.map(n => n.start)) - t) * AIRE_RATE;
      f[23] = cap(starts.reduce((v, n) => v + n.end - n.start, 0) / starts.length, 8);
      f[24] = enabled ? starts.reduce((v, n) => v + n.velocity, 0) / starts.length / 127 : 0;
    }
    if (stops.length) f[22] = (Math.min(...stops.map(n => n.end)) - t) * AIRE_RATE;
  }
  const floats = (data: Float32Array, dims: number[]): AireTensor => ({ type: 'float32', data, dims });
  const category = (value: number): AireTensor => ({ type: 'int64', data: BigInt64Array.of(BigInt(value)), dims: [1] });
  const inputs: Record<string, AireTensor> = {
    lead_pitch: { type: 'int64', data: lead, dims: [1, length] },
    pitch_roll: floats(rolls[0], [1, length, 128]), onset_roll: floats(rolls[1], [1, length, 128]), offset_roll: floats(rolls[2], [1, length, 128]),
    frame_numeric: floats(features, [1, length, 25]), mood_id: category(mood), role_id: category(role), instrument_id: category(0),
    ctrl_numeric: floats(Float32Array.of(0, 1, tempo / 200, num / 8, den / 8, Number(enabled)), [1, 6]),
    mask: { type: 'bool', data: new Uint8Array(length).fill(1), dims: [1, length] },
  };
  for (const t of Object.values(inputs)) if (t.type === 'float32' && !(t.data as Float32Array).every(Number.isFinite)) throw new Error('Nonfinite AIRE feature.');
  return inputs;
}
/** Complementary half-cosine ramps in the overlap, full weight on exposed edges. */
export function aireWindowWeight(frame: number, windowIndex: number, windows: { start: number; length: number }[]): number {
  const current = windows[windowIndex], absolute = current.start + frame;
  let weight = 1;
  if (windowIndex > 0) {
    const previous = windows[windowIndex - 1];
    const overlap = previous.start + previous.length - current.start;
    if (frame < overlap) weight *= (1 - Math.cos(Math.PI * frame / (overlap - 1))) / 2;
  }
  if (windowIndex + 1 < windows.length) {
    const next = windows[windowIndex + 1], overlap = current.start + current.length - next.start;
    if (absolute >= next.start) weight *= (1 + Math.cos(Math.PI * (absolute - next.start) / (overlap - 1))) / 2;
  }
  return weight;
}
export function decodeAireValue(y: number): number {
  if (!Number.isFinite(y) || y < 0 || y > 1) throw new Error('Invalid AIRE prediction.');
  return Math.min(127, Math.max(0, Math.floor(Math.fround(y * 127) + 0.5)));
}
