import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import request from '../../test/fixtures/aire/four-bars-request.json';
import reference from '../../test/fixtures/aire/encoder-reference.json';
import { AIRE_MODELS, aireModelUrl } from './config';
import { aireWindows, aireWindowWeight, decodeAireValue, encodeAireWindow } from './encoder';
import { runAireSections, withAireBackendFallback } from './inference';
import type { AireSection } from './types';
const section: AireSection = { notes: request.notes, tempo: request.tempo_bpm,
  meter: [4, 4], originBeat: 0, duration: 16, hardEnd: 17 };
const options = { modelId: 'S03' as const, mood: 'peaceful', role: 'pad' };
describe('AIRE encoding and windows', () => {
  it('matches every tensor byte in the original four-bar reference encoder', () => {
    const inputs = encodeAireWindow(section, options, 0, 272);
    for (const [key, tensor] of Object.entries(inputs)) {
      const expected = reference.tensors[key as keyof typeof reference.tensors];
      expect(tensor.type, key).toBe(expected.type); expect(tensor.dims, key).toEqual(expected.dims);
      expect(createHash('sha256').update(new Uint8Array(tensor.data.buffer)).digest('hex'), key).toBe(expected.sha256);
    }
  });
  it('keeps family-specific category IDs and normalizes only the base URL slash', () => {
    expect(AIRE_MODELS.S03.moods.indexOf('scary')).toBe(12);
    expect(AIRE_MODELS.B01.moods.indexOf('scary')).toBe(14);
    expect(AIRE_MODELS.W01.moods.indexOf('scary')).toBe(13);
    expect(aireModelUrl('https://host/models', 'S03')).toBe('https://host/models/aire-strings-a02b-s03/model.onnx');
    expect(() => aireModelUrl('file:///models', 'S03')).toThrow();
  });
  it('respects 2048 and 2049 frame limits and shorter final windows', () => {
    expect(aireWindows(2048)).toEqual([{ start: 0, length: 2048 }]);
    expect(aireWindows(2049)).toEqual([{ start: 0, length: 2048 }, { start: 1024, length: 1025 }]);
    expect(aireWindows(4097).map(w => w.length)).toEqual([2048, 2048, 2048, 1025]);
    expect(aireWindows(0)).toEqual([]);
  });
  it('retains held-note features and global musical phase across window starts', () => {
    const held = { ...section, notes: [{ pitch: 60, start: -4, end: 140, velocity: 70 }], hardEnd: 141, duration: 140, originBeat: 1.25 };
    const a = encodeAireWindow(held, options, 1024, 1024);
    expect(a.onset_roll.data.every(v => v === 0)).toBe(true);
    expect(a.lead_pitch.data[0]).toBe(60n);
    expect(a.frame_numeric.data[4]).toBe(1); // elapsed duration capped at eight beats
    expect(a.frame_numeric.data[12]).toBeCloseTo(1);
    expect(a.ctrl_numeric.data[5]).toBe(0);
    const varied = encodeAireWindow({ ...section, notes: section.notes.map((n, i) => ({ ...n, velocity: 64 + i })) }, options, 0, 272);
    expect(varied.ctrl_numeric.data[5]).toBe(1);
  });
  it('uses complementary cosine weights and full exposed edges', () => {
    const windows = aireWindows(4097);
    expect(aireWindowWeight(0, 0, windows)).toBe(1);
    expect(aireWindowWeight(1024, 0, windows)).toBe(1);
    expect(aireWindowWeight(0, 1, windows)).toBe(0);
    for (let i = 0; i < 1024; i++) expect(aireWindowWeight(1024 + i, 0, windows) + aireWindowWeight(i, 1, windows)).toBeCloseTo(1, 12);
    expect(aireWindowWeight(1024, 3, windows)).toBe(1);
  });
  it('merges normalized windows before rounding and reports completed windows', async () => {
    const progress = vi.fn(); let calls = 0;
    const points = await runAireSections([{ ...section, duration: 128.0625, hardEnd: 128.0625 }], options,
      async inputs => new Float32Array(inputs.lead_pitch.dims[1]).fill(calls++ === 0 ? 0 : 1), progress);
    expect(calls).toBe(2); expect(points).toHaveLength(2049);
    expect(points[1024].value).toBe(0); expect(points[2047].value).toBe(127); expect(points[2048]).toEqual({ tick: 122880, value: 127 });
    expect(points[1536].value).toBe(64);
    expect(progress.mock.calls).toEqual([[0, 2], [1, 2], [2, 2]]);
  });
  it('rejects malformed predictions and rounds half up', async () => {
    expect(decodeAireValue(0.5)).toBe(64);
    expect(() => decodeAireValue(NaN)).toThrow(); expect(() => decodeAireValue(1.1)).toThrow();
    await expect(runAireSections([section], options, async () => Float32Array.of(1), () => {})).rejects.toThrow('length');
  });
  it('restarts on WASM after GPU initialization or execution failure', async () => {
    const run = vi.fn(async (provider: string) => { if (provider === 'webgpu') throw new Error('device lost'); return [1, 2]; });
    expect(await withAireBackendFallback(true, run)).toEqual([1, 2]);
    expect(run.mock.calls).toEqual([['webgpu'], ['wasm']]);
    run.mockClear(); await withAireBackendFallback(false, run); expect(run.mock.calls).toEqual([['wasm']]);
  });
});
