import * as ort from 'onnxruntime-web/webgpu';
import wasmMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { runAireSections, withAireBackendFallback } from '../util/aire/inference';
import { simplifyAirePoints } from '../util/aire/simplification';
import { TICKS_PER_QUARTER } from '../core/timing';
import type { AireWorkerMessage, AireWorkerRequest } from '../util/aire/types';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { mjs: wasmMjsUrl, wasm: wasmUrl };
const send = (message: AireWorkerMessage) => self.postMessage(message);
self.onmessage = async (event: MessageEvent<AireWorkerRequest>) => {
  const { model, sections, options, simplification } = event.data;
  try {
    const points = await withAireBackendFallback('gpu' in navigator, async provider => {
      const session = await ort.InferenceSession.create(model, { executionProviders: [provider] });
      try {
        return await runAireSections(sections, options, async encoded => {
          const feeds: Record<string, ort.Tensor> = {};
          let output: ort.InferenceSession.ReturnType | undefined;
          try {
            for (const [key, tensor] of Object.entries(encoded)) feeds[key] = new ort.Tensor(tensor.type, tensor.data, tensor.dims);
            output = await session.run(feeds);
            return new Float32Array(await output.normalized_cc1.getData() as Float32Array);
          } finally {
            for (const tensor of Object.values(feeds)) tensor.dispose();
            if (output) for (const tensor of Object.values(output)) tensor.dispose();
          }
        }, (completed, total) => send({ type: 'progress', progress: { completed, total, provider } }));
      } finally { await session.release(); }
    });
    const joinTicks = sections.slice(1).map(section => Math.round(section.originBeat * TICKS_PER_QUARTER));
    send({ type: 'result', points: simplifyAirePoints(points, simplification, joinTicks) });
  } catch (error) { send({ type: 'error', error: error instanceof Error ? error.message : String(error) }); }
};
