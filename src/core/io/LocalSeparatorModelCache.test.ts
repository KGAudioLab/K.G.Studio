import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalSeparatorModelCache } from '../../util/local-separator/modelCache';
import {
  LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES,
  LOCAL_SEPARATOR_MODEL_FILENAME,
} from '../../util/local-separator/config';

class MockWritableFileStream {
  private readonly handle: MockFileSystemFileHandle;
  private chunks: Uint8Array[] = [];

  constructor(handle: MockFileSystemFileHandle) {
    this.handle = handle;
  }

  async write(content: ArrayBuffer | ArrayBufferView | string): Promise<void> {
    const bytes = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content instanceof ArrayBuffer
        ? new Uint8Array(content)
        : new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    this.chunks.push(new Uint8Array(bytes));
  }

  async close(): Promise<void> {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.handle.setContent(merged);
  }

  async abort(): Promise<void> {
    this.chunks = [];
  }
}

class MockFileSystemFileHandle {
  kind = 'file' as const;
  private content = new Uint8Array();

  constructor(public readonly name: string) {}

  setContent(content: Uint8Array): void {
    this.content = content;
  }

  async getFile(): Promise<File> {
    return {
      size: this.content.byteLength,
      text: async () => new TextDecoder().decode(this.content),
      arrayBuffer: async () => this.content.buffer.slice(0),
    } as unknown as File;
  }

  async createWritable(): Promise<MockWritableFileStream> {
    return new MockWritableFileStream(this);
  }
}

class MockFileSystemDirectoryHandle {
  kind = 'directory' as const;
  private entries = new Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>();

  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemDirectoryHandle> {
    let entry = this.entries.get(name);
    if (!entry || entry.kind !== 'directory') {
      if (!options?.create) {
        throw new DOMException(`Directory "${name}" not found`, 'NotFoundError');
      }
      entry = new MockFileSystemDirectoryHandle(name);
      this.entries.set(name, entry);
    }
    return entry as MockFileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemFileHandle> {
    let entry = this.entries.get(name);
    if (!entry || entry.kind !== 'file') {
      if (!options?.create) {
        throw new DOMException(`File "${name}" not found`, 'NotFoundError');
      }
      entry = new MockFileSystemFileHandle(name);
      this.entries.set(name, entry);
    }
    return entry as MockFileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.has(name)) {
      throw new DOMException(`Entry "${name}" not found`, 'NotFoundError');
    }
    this.entries.delete(name);
  }

  clear(): void {
    this.entries.clear();
  }
}

const mockRoot = new MockFileSystemDirectoryHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(async () => mockRoot),
  },
});

describe('LocalSeparatorModelCache', () => {
  const makeModelBytes = (fill: number): Uint8Array => new Uint8Array(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES).fill(fill);

  beforeEach(() => {
    mockRoot.clear();
    vi.restoreAllMocks();
  });

  it('downloads and stores a model in OPFS cache', async () => {
    const bytes = makeModelBytes(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'Content-Length': String(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES) },
    })));

    await LocalSeparatorModelCache.download('https://example.com/model.onnx');

    expect(await LocalSeparatorModelCache.exists()).toBe(true);
    const buffer = await LocalSeparatorModelCache.getArrayBuffer();
    expect(buffer.byteLength).toBe(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES);
    expect(new Uint8Array(buffer)[0]).toBe(1);
  });

  it('replaces a broken cached file on redownload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(makeModelBytes(1), {
      status: 200,
      headers: { 'Content-Length': String(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES) },
    })));
    await LocalSeparatorModelCache.download('https://example.com/model.onnx');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(makeModelBytes(9), {
      status: 200,
      headers: { 'Content-Length': String(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES) },
    })));
    await LocalSeparatorModelCache.download('https://example.com/model.onnx');

    const buffer = await LocalSeparatorModelCache.getArrayBuffer();
    expect(buffer.byteLength).toBe(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES);
    expect(new Uint8Array(buffer)[0]).toBe(9);
  });

  it('deletes the cached model file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(makeModelBytes(2), {
      status: 200,
      headers: { 'Content-Length': String(LOCAL_SEPARATOR_MODEL_EXPECTED_SIZE_BYTES) },
    })));
    await LocalSeparatorModelCache.download('https://example.com/model.onnx');

    await LocalSeparatorModelCache.delete();

    expect(await LocalSeparatorModelCache.exists()).toBe(false);
  });

  it('rejects and deletes a cached file when the size is wrong', async () => {
    const dir = await navigator.storage.getDirectory();
    const modelsDir = await dir.getDirectoryHandle('models', { create: true });
    const fileHandle = await modelsDir.getFileHandle(LOCAL_SEPARATOR_MODEL_FILENAME, { create: true });
    const fileWritable = await fileHandle.createWritable();
    await fileWritable.write(new Uint8Array([1, 2, 3]));
    await fileWritable.close();

    const sizeHandle = await modelsDir.getFileHandle(`${LOCAL_SEPARATOR_MODEL_FILENAME}.size`, { create: true });
    const sizeWritable = await sizeHandle.createWritable();
    await sizeWritable.write(String(3));
    await sizeWritable.close();

    expect(await LocalSeparatorModelCache.exists()).toBe(false);
  });

  it('fails a download when the final size does not match the expected model size', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Length': '3' },
    })));

    await expect(LocalSeparatorModelCache.download('https://example.com/model.onnx')).rejects.toThrow(/size mismatch/i);
    expect(await LocalSeparatorModelCache.exists()).toBe(false);
  });
});
