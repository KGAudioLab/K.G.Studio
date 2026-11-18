import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { synthesize } from '../util/instvela/demo/driver.js';
import type { InstVelaProvider, InstVelaRequest, InstVelaWorkerMessage } from '../util/instvela/types';

const mocks = vi.hoisted(() => ({ create: vi.fn(), synthesize: vi.fn() }));
vi.mock('onnxruntime-web/webgpu', () => ({
  env: { wasm: {} },
  InferenceSession: { create: mocks.create },
}));
vi.mock('../util/instvela/modelAssets', () => ({
  readInstVelaAsset: (_bundle: string, name: string) => new TextEncoder().encode(
    name === 'm01_constants.json' ? JSON.stringify({ frame_rate: 200, sample_rate: 48000, selftest_tolerance: { default: 0.01 } })
      : name.startsWith('selftest/') ? JSON.stringify({ inputs: {}, outputs: {} })
        : name.replace(/\.onnx$/, ''),
  ).buffer,
}));
vi.mock('../util/instvela/demo/features.js', () => ({
  computeFeatures: () => ({ continuous: new Float32Array(1), n_frames: 8, use_velocity: false, notes: [] }),
  standardize: (features: Float32Array) => features,
}));
vi.mock('../util/instvela/demo/driver.js', () => ({
  synthesize: mocks.synthesize,
  removeDc: (wave: Float32Array) => wave,
}));

const request: InstVelaRequest = {
  bundle: 'm01-violin-onnx-v1',
  region: { id: 'r1', name: 'Verse', trackId: 1, trackName: 'Violin', startTick: 0, lengthTicks: 960 },
  score: { tempo_bpm: 120, time_signature: [4, 4], bar_origin_beats: 0, controls: { instrument: 'string_violin' }, notes: [] },
};

describe('InstVELA execution provider', () => {
  const messages: InstVelaWorkerMessage[] = [];
  const executions: Array<[InstVelaProvider, InstVelaProvider | null | undefined]> = [];
  let reportedProvider: InstVelaProvider | null | undefined;
  const worker = {
    postMessage: (message: InstVelaWorkerMessage) => {
      messages.push(message);
      if (message.type === 'provider') reportedProvider = message.provider;
    },
    onmessage: (_event: { data: InstVelaRequest }) => Promise.resolve(),
  };
  let rendering: boolean;

  beforeEach(async () => {
    vi.resetModules();
    messages.length = 0;
    executions.length = 0;
    reportedProvider = undefined;
    rendering = false;
    vi.stubGlobal('self', worker);
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockResolvedValue({}) } });
    mocks.create.mockReset().mockImplementation(async (
      bytes: ArrayBuffer, { executionProviders: [provider] }: { executionProviders: InstVelaProvider[] },
    ) => {
      const graph = new TextDecoder().decode(bytes);
      let runs = 0;
      return {
        outputNames: ['out'],
        release: vi.fn().mockResolvedValue(undefined),
        run: async () => {
          runs++;
          if (rendering) executions.push([provider, reportedProvider]);
          // This graph passes the self-test and its first inference call before failing on WebGPU.
          if (graph === 'f0_step' && provider === 'webgpu' && runs === 3) throw new Error('WebGPU execution failed');
          return { out: { getData: async () => Float32Array.of(0.1), dispose: vi.fn() } };
        },
      };
    });
    mocks.synthesize.mockReset().mockImplementation(async ({ run, onProgress }: Parameters<typeof synthesize>[0]) => {
      rendering = true;
      await run('f0_cond', {});
      await run('f0_step', {});
      onProgress({ stage: 'F0 generator', percent: 20, completed: 1, total: 5 });
      await run('f0_step', {});
      await run('f0_step', {});
      await run('ac_cond', {});
      return { wave: Float32Array.of(0.1) };
    });
    await import('./instVelaWorker');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports the provider before each changed backend runs, including a mid-render retry', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await worker.onmessage({ data: request });

    expect(executions).toEqual([
      ['webgpu', 'webgpu'], ['webgpu', 'webgpu'], ['webgpu', 'webgpu'],
      ['wasm', 'wasm'], ['wasm', 'wasm'], ['webgpu', 'webgpu'],
    ]);
    expect(messages.filter(message => message.type === 'provider').map(message => message.provider))
      .toEqual(['webgpu', null, 'wasm', 'webgpu']);
    expect(messages.at(-1)?.type).toBe('result');
    expect(log).toHaveBeenCalledExactlyOnceWith('[InstVELA] Render started for Violin / Verse', expect.objectContaining({
      region: request.region,
      bundle: request.bundle,
      score: request.score,
      seed: 0,
      synthesisSettings: mocks.synthesize.mock.calls[0][0].s,
      resolvedFeatures: { frames: 8, useVelocity: false, notes: [] },
    }));
  });
});
