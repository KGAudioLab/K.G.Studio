import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpfsModelCache } from './opfsModelCache';
import { AIRE_MODEL_IDS, AIRE_MODELS, aireCache, deleteAireModels } from './aire/config';
class Directory {
  dirs = new Map<string, Directory>(); files = new Map<string, Uint8Array>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    if (name.includes('/')) throw new TypeError('Directory name contains slash');
    if (!this.dirs.has(name)) { if (!options?.create) throw new DOMException('', 'NotFoundError'); this.dirs.set(name, new Directory()); }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (name.includes('/')) throw new TypeError('File name contains slash');
    if (!this.files.has(name)) { if (!options?.create) throw new DOMException('', 'NotFoundError'); this.files.set(name, new Uint8Array()); }
    return {
      getFile: async () => ({ size: this.files.get(name)!.length,
        text: async () => new TextDecoder().decode(this.files.get(name)!),
        arrayBuffer: async () => this.files.get(name)!.slice().buffer }),
      createWritable: async () => {
        const chunks: Uint8Array[] = [];
        return { write: async (value: Uint8Array | string) => { chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : value.slice()); },
          close: async () => { const merged = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0)); let offset = 0; for (const c of chunks) { merged.set(c, offset); offset += c.length; } this.files.set(name, merged); },
          abort: async () => { chunks.length = 0; } };
      },
    };
  }
  async removeEntry(name: string) { if (!this.files.delete(name)) throw new DOMException('', 'NotFoundError'); }
}
let root: Directory;
const cache = new OpfsModelCache();
const path = 'aire-strings-a02b-s03/model.onnx';
beforeEach(() => {
  root = new Directory();
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => root } });
});
describe('nested model cache and cancellation', () => {
  it('downloads nested paths with or without content length and preserves flat callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    const progress = vi.fn();
    await cache.download('https://host/model', path, {}, progress);
    expect(await cache.exists(path)).toBe(true); expect(new Uint8Array(await cache.getArrayBuffer(path))).toEqual(Uint8Array.of(1, 2, 3));
    expect(root.dirs.get('models')!.dirs.get('aire-strings-a02b-s03')!.files.has('model.onnx.size')).toBe(true);
    expect(progress.mock.lastCall?.[0].percent).toBe(100);
    await cache.download('https://host/model', 'flat.onnx'); expect(await cache.exists('flat.onnx')).toBe(true);
    await cache.delete(path); expect(await cache.exists(path)).toBe(false); expect(await cache.exists('flat.onnx')).toBe(true);
  });
  it('removes mismatched nested caches in the correct directory', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.of(1, 2, 3))));
    await cache.download('https://host/model', path);
    const dir = root.dirs.get('models')!.dirs.get('aire-strings-a02b-s03')!;
    dir.files.set('model.onnx', Uint8Array.of(1));
    expect(await cache.exists(path)).toBe(false); expect(dir.files.size).toBe(0);
  });
  it('cancels a stuck read, cleans partial files, and supports retry', async () => {
    const cancel = vi.fn();
    const abort = new AbortController(); let sent = false;
    const progress = vi.fn(() => { abort.abort(); });
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (!sent) { c.enqueue(Uint8Array.of(1)); sent = true; } }, cancel });
    await expect(cache.downloadStream(stream, path, null, { signal: abort.signal }, progress)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalled(); expect(await cache.exists(path)).toBe(false);
    expect(root.dirs.get('models')!.dirs.get('aire-strings-a02b-s03')!.files.size).toBe(0);
    await cache.downloadStream(new ReadableStream({ start(c) { c.enqueue(Uint8Array.of(5)); c.close(); } }), path, 1);
    expect(await cache.exists(path)).toBe(true);
  });
  it('aborts while a read is pending with no arriving bytes', async () => {
    const abort = new AbortController(); const cancel = vi.fn();
    const task = cache.downloadStream(new ReadableStream({ cancel }), path, null, { signal: abort.signal });
    await vi.waitFor(() => expect(root.dirs.get('models')?.dirs.get('aire-strings-a02b-s03')?.files.has('model.onnx')).toBe(true));
    abort.abort(); await expect(task).rejects.toMatchObject({ name: 'AbortError' }); expect(cancel).toHaveBeenCalled();
  });
  it('rejects truncated streams and removes all three family caches without touching other models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.of(1, 2, 3), { headers: { 'Content-Length': '6' } })));
    await expect(cache.download('https://host/model', path)).rejects.toThrow('advertised size'); expect(await cache.exists(path)).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Uint8Array.of(1, 2, 3))));
    for (const id of AIRE_MODEL_IDS) await aireCache.download('https://host/model', AIRE_MODELS[id].path);
    await cache.download('https://host/other', 'other.onnx');
    await deleteAireModels();
    expect(await Promise.all(AIRE_MODEL_IDS.map(id => aireCache.exists(AIRE_MODELS[id].path)))).toEqual([false, false, false]);
    expect(await cache.exists('other.onnx')).toBe(true);
  });
});
