import * as ort from 'onnxruntime-web/webgpu';
import wasmMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import { computeFeatures, standardize } from '../util/instvela/demo/features.js';
import { removeDc, synthesize, type InstVelaGraph } from '../util/instvela/demo/driver.js';
import { seededNoise } from '../util/instvela/demo/prng.js';
import { readInstVelaAsset } from '../util/instvela/modelAssets';
import type { InstVelaBundle, InstVelaConstants, InstVelaProgress, InstVelaProvider, InstVelaRequest, InstVelaWorkerMessage } from '../util/instvela/types';

ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = { mjs: wasmMjsUrl, wasm: wasmUrl };
ort.env.logLevel = 'error';

const graphs: InstVelaGraph[] = ['f0_cond', 'f0_step', 'ac_cond', 'ac_step', 'vocoder'];
const tensorTypes = { float32: Float32Array, int64: BigInt64Array, int32: Int32Array, bool: Uint8Array };
type Feeds = Record<string, ort.Tensor>;
type Session = { provider: InstVelaProvider; session: ort.InferenceSession };
type ReferenceTensor = { dtype: keyof typeof tensorTypes; file: string; dims: number[] };
let model: { bundle: InstVelaBundle; constants: InstVelaConstants; sessions: Map<InstVelaGraph, Session> } | undefined;
let busy = false;
let currentProvider: InstVelaProvider | null = null;

function send(message: InstVelaWorkerMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

function progress(value: InstVelaProgress): void {
  send({ type: 'progress', progress: value });
}

function reportProvider(provider: InstVelaProvider | null): void {
  if (provider === currentProvider) return;
  currentProvider = provider;
  send({ type: 'provider', provider });
}

async function readJson<T>(bundle: InstVelaBundle, name: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await readInstVelaAsset(bundle, name))) as T;
}

async function checkWebGpu(
  bundle: InstVelaBundle,
  graph: InstVelaGraph,
  session: ort.InferenceSession,
  tolerance: number,
): Promise<boolean> {
  const reference = await readJson<{ inputs: Record<string, ReferenceTensor>; outputs: Record<string, ReferenceTensor> }>(
    bundle, `selftest/${graph}.json`);
  const feeds: Feeds = {};
  let outputs: ort.InferenceSession.ReturnType | undefined;
  try {
    for (const [name, info] of Object.entries(reference.inputs)) {
      const bytes = await readInstVelaAsset(bundle, `selftest/${info.file}`);
      feeds[name] = new ort.Tensor(info.dtype, new tensorTypes[info.dtype](bytes), info.dims);
    }
    outputs = await session.run(feeds);
    for (const [name, info] of Object.entries(reference.outputs)) {
      const expected = new Float32Array(await readInstVelaAsset(bundle, `selftest/${info.file}`));
      const actual = await outputs[name].getData() as Float32Array;
      if (actual.length !== expected.length) return false;
      let error = 0;
      let scale = 0;
      for (let i = 0; i < expected.length; i++) {
        error = Math.max(error, Math.abs(actual[i] - expected[i]));
        scale = Math.max(scale, Math.abs(expected[i]));
      }
      if (!(error / Math.max(scale, 1e-12) < tolerance)) return false;
    }
    return true;
  } finally {
    Object.values(feeds).forEach(tensor => tensor.dispose());
    if (outputs) Object.values(outputs).forEach(tensor => tensor.dispose());
  }
}

async function loadModel(bundle: InstVelaBundle): Promise<NonNullable<typeof model>> {
  if (model?.bundle === bundle) return model;
  progress({ stage: 'models', percent: null, completed: 0, total: graphs.length });
  if (model) {
    await Promise.all(Array.from(model.sessions.values(), entry => entry.session.release()));
    model = undefined;
  }

  const constants = await readJson<InstVelaConstants>(bundle, 'm01_constants.json');
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const webgpu = await gpu?.requestAdapter().catch(() => null);
  const sessions = new Map<InstVelaGraph, Session>();
  try {
    for (const graph of graphs) {
      const bytes = await readInstVelaAsset(bundle, `${graph}.onnx`);
      if (webgpu) {
        let session: ort.InferenceSession | undefined;
        try {
          session = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] });
          const tolerance = constants.selftest_tolerance[graph] ?? constants.selftest_tolerance.default;
          if (await checkWebGpu(bundle, graph, session, tolerance)) {
            sessions.set(graph, { provider: 'webgpu', session });
            session = undefined;
          }
        } catch (error) {
          console.warn(`[InstVELA] ${graph} is switching to WASM.`, error);
        } finally {
          await session?.release();
        }
      }
      if (!sessions.has(graph)) {
        const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
        sessions.set(graph, { provider: 'wasm', session });
      }
      progress({ stage: 'models', percent: null, completed: sessions.size, total: graphs.length });
    }
    model = { bundle, constants, sessions };
    return model;
  } catch (error) {
    await Promise.allSettled(Array.from(sessions.values(), entry => entry.session.release()));
    throw error;
  }
}

async function runGraph(loaded: NonNullable<typeof model>, graph: InstVelaGraph, feeds: Feeds): Promise<Float32Array[]> {
  const run = async ({ provider, session }: Session) => {
    reportProvider(provider);
    const outputs = await session.run(feeds);
    try {
      const result = [];
      for (const name of session.outputNames) result.push(await outputs[name].getData() as Float32Array);
      return result;
    } finally {
      Object.values(outputs).forEach(tensor => tensor.dispose());
    }
  };

  const entry = loaded.sessions.get(graph)!;
  try {
    return await run(entry);
  } catch (error) {
    if (entry.provider === 'wasm') throw error;
    reportProvider(null);
    await entry.session.release();
    const bytes = await readInstVelaAsset(loaded.bundle, `${graph}.onnx`);
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    const fallback: Session = { provider: 'wasm', session };
    loaded.sessions.set(graph, fallback);
    return await run(fallback);
  } finally {
    Object.values(feeds).forEach(tensor => tensor.dispose());
  }
}

self.onmessage = async ({ data: { bundle, score, region } }: MessageEvent<InstVelaRequest>) => {
  if (busy) return;
  busy = true;
  currentProvider = null;
  try {
    const loaded = await loadModel(bundle);
    const constants = loaded.constants;
    const featureOptions = {
      tailSeconds: 3,
      frameRate: constants.frame_rate,
      minCroppedNoteSeconds: 0.03,
      timeCapSeconds: 8,
    };
    const seed = 0;
    const synthesisSettings = {
      stepsF0: 16, stepsAc: 16, cfgF0: 2, cfgAc: 2, pitchExpression: 1, transpose: 0,
      windowSeconds: 8, knownPrefixSeconds: 2,
      vocoderChunkSeconds: bundle === 'm01-double-bass-onnx-v1' ? 3 : 30,
      vocoderContextSeconds: 1,
    };

    progress({ stage: 'features', percent: null, completed: 0, total: 1 });
    const features = computeFeatures(score, featureOptions);
    const standardizedFeatures = standardize(features.continuous, constants.score_feature_stats);
    progress({ stage: 'features', percent: null, completed: 1, total: 1 });

    console.info(`[InstVELA] Render started for ${region.trackName} / ${region.name}`, {
      region,
      bundle,
      score,
      featureOptions,
      resolvedFeatures: { frames: features.n_frames, useVelocity: features.use_velocity, notes: features.notes },
      seed,
      synthesisSettings,
      modelConstants: constants,
      runtime: {
        providersAtStart: Object.fromEntries(Array.from(loaded.sessions, ([graph, { provider }]) => [graph, provider])),
        wasmThreads: ort.env.wasm.numThreads,
      },
      output: { format: 'Float32 PCM', channels: 1, sampleRate: constants.sample_rate, removeDc: true, hallReverb: false },
    });
    const result = await synthesize({
      ort,
      run: (graph, feeds) => runGraph(loaded, graph, feeds),
      C: constants,
      feats: features,
      x: standardizedFeatures,
      noise: seededNoise(seed),
      s: synthesisSettings,
      onProgress: progress,
    });
    const wave = removeDc(result.wave);
    if (!wave.length || wave.some(sample => !Number.isFinite(sample))) throw new Error('InstVELA returned invalid audio.');
    progress({ stage: 'done', percent: 100, completed: 1, total: 1 });
    send({ type: 'result', audio: { wave, sampleRate: constants.sample_rate } }, [wave.buffer]);
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
};
