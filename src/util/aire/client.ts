import type { AirePoint, AireProgress, AireWorkerMessage, AireWorkerRequest } from './types';
let workerActive = false;
export function runAireWorker(request: AireWorkerRequest, signal: AbortSignal, progress: (value: AireProgress) => void): Promise<AirePoint[]> {
  signal.throwIfAborted();
  if (workerActive) return Promise.reject(new Error('AIRE is already processing another request.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/aireWorker.ts', import.meta.url), { type: 'module' });
    workerActive = true;
    let settled = false;
    const cleanup = () => { if (settled) return; settled = true; workerActive = false; worker.terminate(); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<AireWorkerMessage>) => {
      if (signal.aborted || settled) return;
      const message = event.data;
      if (message.type === 'progress') progress(message.progress);
      else { cleanup(); if (message.type === 'result') resolve(message.points); else reject(new Error(message.error)); }
    };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'AIRE worker failed.')); };
    worker.onmessageerror = () => { cleanup(); reject(new Error('Unable to read AIRE worker response.')); };
    try { worker.postMessage(request, [request.model]); } catch (e) { cleanup(); reject(e); }
  });
}
// Serialize cache writes across cancellation/retry, preventing old cleanup from deleting a new download.
let cacheTask: Promise<void> = Promise.resolve();
export async function serializeAireCacheTask<T>(task: () => Promise<T>): Promise<T> {
  const previous = cacheTask;
  let release!: () => void;
  cacheTask = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await task(); } finally { release(); }
}
