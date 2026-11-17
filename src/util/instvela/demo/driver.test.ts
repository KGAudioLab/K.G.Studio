import * as ort from 'onnxruntime-web/webgpu';
import { expect, it } from 'vitest';
import type { InstVelaProgress } from '../types';
import { synthesize } from './driver.js';
import { seededNoise } from './prng.js';

it('counts windows in the generator labels while advancing the render bar per inference call', async () => {
  const frames = 29;
  const progress: InstVelaProgress[] = [];
  await synthesize({
    ort,
    C: {
      frame_rate: 1, sample_rate: 240, latent_dim: 1, latent_mean: [0], latent_std: [1], residual_std: 1,
      pad_multiple: { f0_step: 1, ac_step: 1 }, hop: 240, source_harmonics: 1,
      score_feature_stats: { standardized: {} }, selftest_tolerance: {},
    },
    feats: {
      n_frames: frames, reference_pitch: new Float32Array(frames).fill(60),
      continuous: new Float32Array(frames * 18), categorical: new Uint8Array(frames * 4),
      use_velocity: false, notes: [],
    },
    x: new Float32Array(frames * 18),
    noise: seededNoise(0),
    s: {
      stepsF0: 16, stepsAc: 16, cfgF0: 2, cfgAc: 2, pitchExpression: 1, transpose: 0,
      windowSeconds: 8, knownPrefixSeconds: 2, vocoderChunkSeconds: 30, vocoderContextSeconds: 1,
    },
    run: async (graph, feeds) => {
      switch (graph) {
        case 'f0_cond':
        case 'ac_cond': return [new Float32Array(frames * 128)];
        case 'f0_step': return [new Float32Array(feeds.x_t.size), new Float32Array(feeds.x_t.size)];
        case 'ac_step': return [new Float32Array(feeds.z_t.size)];
        case 'vocoder': return [new Float32Array(feeds.f0_hz.size * 240)];
      }
    },
    onProgress: value => progress.push(value),
  });

  for (const stage of ['F0 generator', 'acoustic generator']) {
    const updates = progress.filter(value => value.stage === stage);
    expect(updates.every(value => value.total === 5)).toBe(true);
    expect([...new Set(updates.map(value => value.completed))]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(updates[1].completed).toBe(0);
    expect(updates[1].percent).toBeGreaterThan(updates[0].percent!);
  }
  expect(progress.at(-1)?.percent).toBeCloseTo(100 * 163 / 164);
});
