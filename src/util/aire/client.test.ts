import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAireWorker, serializeAireCacheTask } from './client';
import type { AireWorkerRequest } from './types';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn(); postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  result() { this.onmessage?.({ data: { type: 'result', points: [{ tick: 0, value: 64 }] } } as MessageEvent); }
}
const request = (): AireWorkerRequest => ({ model: new ArrayBuffer(1), options: { modelId: 'S03', mood: 'peaceful', role: 'pad' }, sections: [] });
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; });
describe('AIRE worker lifecycle', () => {
  it('allows one active worker and releases it on successful completion', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController();
    const first = runAireWorker(request(), controller.signal, () => {});
    await expect(runAireWorker(request(), controller.signal, () => {})).rejects.toThrow('already processing');
    FakeWorker.instances[0].result(); expect(await first).toEqual([{ tick: 0, value: 64 }]);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
    const next = runAireWorker(request(), controller.signal, () => {}); FakeWorker.instances[1].result(); await next;
  });
  it('terminates on cancellation and rejects stale messages without committing', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const controller = new AbortController(); const progress = vi.fn();
    const first = runAireWorker(request(), controller.signal, progress);
    controller.abort(); await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    FakeWorker.instances[0].result(); expect(progress).not.toHaveBeenCalled();
    const second = runAireWorker(request(), new AbortController().signal, progress); FakeWorker.instances[1].result(); await second;
  });
  it('releases the worker after runtime failures', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const task = runAireWorker(request(), new AbortController().signal, () => {});
    FakeWorker.instances[0].onmessage?.({ data: { type: 'error', error: 'runtime failure' } } as MessageEvent);
    await expect(task).rejects.toThrow('runtime failure'); expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });
  it('serializes retry after old cache cleanup even when the prior request fails', async () => {
    let release!: () => void; const order: string[] = [];
    const first = serializeAireCacheTask(async () => { order.push('old'); await new Promise<void>(r => { release = r; }); order.push('cleanup'); throw new Error('cancelled'); });
    const failure = expect(first).rejects.toThrow('cancelled');
    const next = serializeAireCacheTask(async () => { order.push('new'); return 1; });
    await vi.waitFor(() => expect(order).toEqual(['old'])); release();
    await failure; expect(await next).toBe(1); expect(order).toEqual(['old', 'cleanup', 'new']);
  });
});
