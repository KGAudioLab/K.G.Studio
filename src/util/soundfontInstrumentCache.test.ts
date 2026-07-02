import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundfontInstrumentCache } from './soundfontInstrumentCache';

class MockWritableFileStream {
  private readonly handle: MockFileSystemFileHandle;
  private chunks: Uint8Array[] = [];

  constructor(handle: MockFileSystemFileHandle) {
    this.handle = handle;
  }

  async write(content: Blob | ArrayBuffer | ArrayBufferView | string): Promise<void> {
    let bytes: Uint8Array;
    if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else if (typeof (content as Blob).arrayBuffer === 'function') {
      bytes = new Uint8Array(await (content as Blob).arrayBuffer());
    } else if (content instanceof ArrayBuffer) {
      bytes = new Uint8Array(content);
    } else {
      const view = content as ArrayBufferView;
      bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
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
    } as unknown as File;
  }

  async createWritable(): Promise<MockWritableFileStream> {
    return new MockWritableFileStream(this);
  }
}

class MockFileSystemDirectoryHandle {
  kind = 'directory' as const;
  private children = new Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>();

  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemDirectoryHandle> {
    let child = this.children.get(name);
    if (!child || child.kind !== 'directory') {
      if (!options?.create) {
        throw new DOMException(`Directory "${name}" not found`, 'NotFoundError');
      }
      child = new MockFileSystemDirectoryHandle(name);
      this.children.set(name, child);
    }
    return child as MockFileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemFileHandle> {
    let child = this.children.get(name);
    if (!child || child.kind !== 'file') {
      if (!options?.create) {
        throw new DOMException(`File "${name}" not found`, 'NotFoundError');
      }
      child = new MockFileSystemFileHandle(name);
      this.children.set(name, child);
    }
    return child as MockFileSystemFileHandle;
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const child = this.children.get(name);
    if (!child) {
      throw new DOMException(`Entry "${name}" not found`, 'NotFoundError');
    }
    if (child.kind === 'directory' && child.size() > 0 && !options?.recursive) {
      throw new DOMException(`Directory "${name}" is not empty`, 'InvalidModificationError');
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle]> {
    for (const entry of this.children.entries()) {
      yield entry;
    }
  }

  clear(): void {
    this.children.clear();
  }

  size(): number {
    return this.children.size;
  }
}

const mockRoot = new MockFileSystemDirectoryHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(async () => mockRoot),
  },
});

describe('SoundfontInstrumentCache', () => {
  const baseUrl = 'https://cdn.example.com/FluidR3_GM/';
  const instrumentName = 'test_instrument';
  const expectedKeys = ['C4', 'Db4'];
  const blobsByKey = {
    C4: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
    Db4: new Blob([new Uint8Array([4, 5, 6])], { type: 'audio/mpeg' }),
  };

  beforeEach(async () => {
    mockRoot.clear();
    vi.restoreAllMocks();
  });

  it('stores and validates a finalized instrument cache', async () => {
    await SoundfontInstrumentCache.storeInstrument(instrumentName, expectedKeys, blobsByKey, baseUrl);

    const summary = await SoundfontInstrumentCache.getCacheSummary(baseUrl);
    expect(summary.instrumentCount).toBe(1);
    expect(summary.instruments).toEqual([instrumentName]);

    const urls = await SoundfontInstrumentCache.getInstrumentObjectUrls(instrumentName, expectedKeys, baseUrl);
    expect(Object.keys(urls)).toEqual(expectedKeys);
    Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  });

  it('rejects incomplete finalize attempts', async () => {
    await expect(SoundfontInstrumentCache.storeInstrument(
      instrumentName,
      expectedKeys,
      { C4: blobsByKey.C4 },
      baseUrl,
    )).rejects.toThrow(/incomplete key set/i);

    expect(await SoundfontInstrumentCache.exists(instrumentName, expectedKeys, baseUrl)).toBe(false);
  });

  it('invalidates cached instruments when the base URL changes', async () => {
    await SoundfontInstrumentCache.storeInstrument(instrumentName, expectedKeys, blobsByKey, baseUrl);
    expect((await SoundfontInstrumentCache.getCacheSummary(baseUrl)).instrumentCount).toBe(1);

    expect((await SoundfontInstrumentCache.getCacheSummary('https://other.example.com/FluidR3_GM/')).instrumentCount).toBe(0);
    const summary = await SoundfontInstrumentCache.getCacheSummary('https://other.example.com/FluidR3_GM/');
    expect(summary.instrumentCount).toBe(0);
  });

  it('treats broken cached instruments as invalid and removes them', async () => {
    await SoundfontInstrumentCache.storeInstrument(instrumentName, expectedKeys, blobsByKey, baseUrl);

    const root = await navigator.storage.getDirectory();
    const soundfontDir = await root.getDirectoryHandle('soundfont');
    const libraryDir = await soundfontDir.getDirectoryHandle('FluidR3_GM');
    const instrumentDir = await libraryDir.getDirectoryHandle(instrumentName);
    await instrumentDir.removeEntry('Db4.mp3');

    expect(await SoundfontInstrumentCache.exists(instrumentName, expectedKeys, baseUrl)).toBe(false);
    const summary = await SoundfontInstrumentCache.getCacheSummary(baseUrl);
    expect(summary.instrumentCount).toBe(0);
  });

  it('deletes all cached instruments', async () => {
    await SoundfontInstrumentCache.storeInstrument(instrumentName, expectedKeys, blobsByKey, baseUrl);
    await SoundfontInstrumentCache.storeInstrument('other_instrument', expectedKeys, blobsByKey, baseUrl);

    await SoundfontInstrumentCache.deleteAll();

    const summary = await SoundfontInstrumentCache.getCacheSummary(baseUrl);
    expect(summary.instrumentCount).toBe(0);
  });
});
