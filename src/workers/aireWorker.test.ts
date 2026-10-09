import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AireWorkerRequest } from '../util/aire/types';

const mocks = vi.hoisted(() => ({ runSections: vi.fn(), create: vi.fn(), release: vi.fn() }));
vi.mock('onnxruntime-web/webgpu', () => ({
  env: { wasm: {} },
  InferenceSession: { create: mocks.create },
}));
vi.mock('../util/aire/inference', async importOriginal => ({
  ...await importOriginal<typeof import('../util/aire/inference')>(),
  runAireSections: mocks.runSections,
}));

const dense = Array.from({ length: 9 }, (_, i) => ({ tick: i * 60, value: 20 + i * 5 }));
const request = (): AireWorkerRequest => ({
  model: new ArrayBuffer(1), options: { modelId: 'S03', mood: 'peaceful', role: 'pad' },
  sections: [0, 0.25].map(originBeat => ({ originBeat, notes: [], tempo: 120, meter: [4, 4], duration: 0.25, hardEnd: 1.25 })),
});
let worker: { postMessage: ReturnType<typeof vi.fn>; onmessage: ((event: MessageEvent<AireWorkerRequest>) => Promise<void>) | null };
beforeEach(async () => {
  vi.resetModules();
  mocks.create.mockReset().mockResolvedValue({ release: mocks.release });
  mocks.release.mockReset().mockResolvedValue(undefined);
  mocks.runSections.mockReset().mockResolvedValue(dense);
  worker = { postMessage: vi.fn(), onmessage: null };
  vi.stubGlobal('self', worker); vi.stubGlobal('navigator', { gpu: {} });
  await import('./aireWorker');
});
afterEach(() => vi.unstubAllGlobals());

describe('AIRE worker simplification', () => {
  it('keeps dense inference output for existing callers', async () => {
    await worker.onmessage!({ data: request() } as MessageEvent<AireWorkerRequest>);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'result', points: dense });
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('simplifies only the successful fallback output and preserves tempo joins', async () => {
    mocks.runSections.mockRejectedValueOnce(new Error('GPU execution failed'));
    await worker.onmessage!({ data: { ...request(), simplification: 'medium' } } as MessageEvent<AireWorkerRequest>);
    expect(mocks.create.mock.calls.map(call => call[1].executionProviders)).toEqual([['webgpu'], ['wasm']]);
    // 0.25 quarter notes = 240 ticks: keep the preceding sample and the join.
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'result', points: [dense[0], dense[3], dense[4], dense[8]] });
    expect(mocks.release).toHaveBeenCalledTimes(2);
    expect(dense).toHaveLength(9);
  });
});
