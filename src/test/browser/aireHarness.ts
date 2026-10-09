import { runAireWorker } from '../../util/aire/client';
import { aireCache, AIRE_MODELS } from '../../util/aire/config';
import request from '../fixtures/aire/four-bars-request.json';
import expected from '../fixtures/aire/four-bars-s03-output.json';
import type { AireModelId, AireProgress } from '../../util/aire/types';
import { runAireSections } from '../../util/aire/inference';
import * as ort from 'onnxruntime-web/webgpu';
import wasmMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
async function runFixture(id: AireModelId = 'S03') {
  const path = AIRE_MODELS[id].path;
  const progress: AireProgress[] = [];
  if (!await aireCache.exists(path)) await aireCache.download(`${import.meta.env.BASE_URL}fixture-model/${id}`, path);
  const model = await aireCache.getArrayBuffer(path);
  const points = await runAireWorker({ model, options: { modelId: id, mood: 'peaceful', role: 'pad' },
    sections: [{ notes: request.notes, tempo: 120, meter: [4, 4], originBeat: 0, duration: 17, hardEnd: 17 }] }, new AbortController().signal, p => progress.push(p));
  return { points, progress, expected: expected.events.map(e => e.cc1), isolated: crossOriginIsolated, cached: await aireCache.exists(path) };
}
async function runLongFixture() {
  const model = await aireCache.getArrayBuffer(AIRE_MODELS.S03.path);
  const progress: AireProgress[] = [];
  const points = await runAireWorker({ model, options: { modelId: 'S03', mood: 'peaceful', role: 'pad' },
    sections: [{ notes: [{ pitch: 60, start: 0, end: 128.0625, velocity: 64 }], tempo: 120, meter: [4, 4], originBeat: 0,
      duration: 128.0625, hardEnd: 129.0625 }] }, new AbortController().signal, p => progress.push(p));
  return { points, progress };
}
async function cancelFixture() {
  const controller = new AbortController();
  try {
    await runAireWorker({ model: await aireCache.getArrayBuffer(AIRE_MODELS.S03.path),
      options: { modelId: 'S03', mood: 'peaceful', role: 'pad' },
      sections: [{ notes: request.notes, tempo: 120, meter: [4, 4], originBeat: 0, duration: 17, hardEnd: 17 }] },
      controller.signal, () => controller.abort());
  } catch (error) { return error instanceof DOMException && error.name === 'AbortError'; }
  return false;
}
// Explicit WASM parity verification, independent of GPU availability.
async function runWasmFixture() {
  ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: wasmMjs, wasm };
  const response = await fetch(`${import.meta.env.BASE_URL}fixture-model/S03`);
  const session = await ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'] });
  try {
    return await runAireSections([{ notes: request.notes, tempo: 120, meter: [4, 4], originBeat: 0, duration: 17, hardEnd: 17 }],
      { modelId: 'S03', mood: 'peaceful', role: 'pad' }, async encoded => {
        const feeds: Record<string, ort.Tensor> = {}; let output: ort.InferenceSession.ReturnType | undefined;
        try {
          for (const [name, tensor] of Object.entries(encoded)) feeds[name] = new ort.Tensor(tensor.type, tensor.data, tensor.dims);
          output = await session.run(feeds); return new Float32Array(await output.normalized_cc1.getData() as Float32Array);
        } finally { Object.values(feeds).forEach(t => t.dispose()); if (output) Object.values(output).forEach(t => t.dispose()); }
      }, () => {});
  } finally { await session.release(); }
}
declare global { interface Window { aireFixture: typeof runFixture; aireWasmFixture: typeof runWasmFixture; aireLongFixture: typeof runLongFixture; aireCancelFixture: typeof cancelFixture } }
window.aireFixture = runFixture; window.aireWasmFixture = runWasmFixture;

window.aireLongFixture = runLongFixture; window.aireCancelFixture = cancelFixture;
