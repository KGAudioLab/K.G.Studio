import { describe, it, expect, beforeEach, vi } from 'vitest';
import { instanceToPlain } from 'class-transformer';
import { KGProject } from '../KGProject';

// --- Mock idb for reading old IndexedDB projects ---
const mockProjects: Array<{ name: string; data: Record<string, unknown>; lastModified: number }> = [];

vi.mock('idb', () => {
  const stores: Record<string, Map<string, unknown>> = {};
  const getStore = (name: string) => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };

  return {
    openDB: vi.fn(() => {
      const db = {
        getAll: vi.fn((storeName: string) => {
          if (storeName === 'projects') return Promise.resolve([...mockProjects]);
          return Promise.resolve([...getStore(storeName).values()]);
        }),
        get: vi.fn((storeName: string, key: string) => getStore(storeName).get(key)),
        put: vi.fn((storeName: string, value: { name: string }) => {
          getStore(storeName).set(value.name, value);
        }),
        close: vi.fn(),
        objectStoreNames: { contains: () => false },
      };
      return Promise.resolve(db);
    }),
    __stores: stores,
    __reset: () => Object.keys(stores).forEach((k) => delete stores[k]),
  };
});

// --- Mock OPFS for KGProjectStorage ---
class MockWritable {
  data = '';
  async write(content: string) { this.data = content; }
  async close() {}
}

class MockFileHandle {
  kind = 'file' as const;
  private _content = '';
  constructor(public name: string) {}
  async getFile() { return { text: () => Promise.resolve(this._content) }; }
  async createWritable() {
    const w = new MockWritable();
    const self = this;
    const origClose = w.close.bind(w);
    w.close = async () => { self._content = w.data; await origClose(); };
    return w;
  }
}

class MockDirHandle {
  kind = 'directory' as const;
  entries = new Map<string, MockDirHandle | MockFileHandle>();
  constructor(public name: string) {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let e = this.entries.get(name);
    if (!e || e.kind !== 'directory') {
      if (opts?.create) {
        e = new MockDirHandle(name);
        this.entries.set(name, e);
      } else {
        throw new DOMException('Not found', 'NotFoundError');
      }
    }
    return e as MockDirHandle;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let e = this.entries.get(name);
    if (!e || e.kind !== 'file') {
      if (opts?.create) {
        e = new MockFileHandle(name);
        this.entries.set(name, e);
      } else {
        throw new DOMException('Not found', 'NotFoundError');
      }
    }
    return e as MockFileHandle;
  }

  async removeEntry(name: string) { this.entries.delete(name); }

  async *values() {
    for (const e of this.entries.values()) yield e;
  }
}

const mockRoot = new MockDirHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(() => Promise.resolve(mockRoot)),
    persist: vi.fn(() => Promise.resolve(true)),
  },
});

// Now import the module under test
import { upgradeConfigToV1 } from './upgradeConfigToV1';
import { KGProjectStorage } from '../io/KGProjectStorage';

describe('upgradeConfigToV1', () => {
  beforeEach(async () => {
    mockProjects.length = 0;
    mockRoot.entries.clear();

    // Reset KGProjectStorage singleton
    ;(KGProjectStorage as unknown as { _instance: undefined })._instance = undefined;
    const storage = KGProjectStorage.getInstance();
    await storage.initialize();
  });

  it('migrates projects from IndexedDB to OPFS', async () => {
    // Set up a mock IndexedDB project
    const project = new KGProject('My Old Song', 32, 0, 130);
    mockProjects.push({
      name: 'My Old Song',
      data: instanceToPlain(project) as Record<string, unknown>,
      lastModified: 1700000000000,
    });

    await upgradeConfigToV1();

    const storage = KGProjectStorage.getInstance();
    const names = await storage.list();
    expect(names).toContain('My Old Song');

    const loaded = await storage.load('My Old Song');
    expect(loaded).not.toBeNull();
    expect(loaded!.getBpm()).toBe(130);
  });

  it('sanitizes project names with invalid characters', async () => {
    const project = new KGProject('My:Song/Here', 32, 0, 120);
    mockProjects.push({
      name: 'My:Song/Here',
      data: instanceToPlain(project) as Record<string, unknown>,
      lastModified: Date.now(),
    });

    await upgradeConfigToV1();

    const storage = KGProjectStorage.getInstance();
    const names = await storage.list();
    // Should be sanitized — no colons or slashes
    expect(names).toContain('My_Song_Here');
  });

  it('skips projects that already exist in OPFS', async () => {
    // Pre-create a project in OPFS
    const storage = KGProjectStorage.getInstance();
    const existing = new KGProject('Existing', 32, 0, 100);
    await storage.save('Existing', existing);

    // Add same project to IndexedDB mock
    mockProjects.push({
      name: 'Existing',
      data: instanceToPlain(existing) as Record<string, unknown>,
      lastModified: Date.now(),
    });

    // Should not throw or overwrite
    await upgradeConfigToV1();

    const loaded = await storage.load('Existing');
    expect(loaded!.getBpm()).toBe(100); // Original BPM preserved
  });

  it('handles empty IndexedDB gracefully', async () => {
    // No projects in IndexedDB
    await expect(upgradeConfigToV1()).resolves.not.toThrow();
  });
});
