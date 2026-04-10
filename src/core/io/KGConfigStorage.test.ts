import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock idb before importing KGConfigStorage
vi.mock('idb', () => {
  const stores: Record<string, Map<string, unknown>> = {};

  const getStore = (name: string): Map<string, unknown> => {
    if (!stores[name]) stores[name] = new Map();
    return stores[name];
  };

  const mockDB = {
    get: vi.fn((storeName: string, key: string) => {
      return getStore(storeName).get(key) ?? undefined;
    }),
    put: vi.fn((storeName: string, value: { name: string }) => {
      getStore(storeName).set(value.name, value);
    }),
    delete: vi.fn((storeName: string, key: string) => {
      getStore(storeName).delete(key);
    }),
    objectStoreNames: { contains: () => false },
  };

  return {
    openDB: vi.fn(() => Promise.resolve(mockDB)),
    __stores: stores,
    __reset: () => {
      Object.keys(stores).forEach((k) => delete stores[k]);
    },
  };
});

import { KGConfigStorage } from './KGConfigStorage';

// Access mock internals
const idbMock = await import('idb') as unknown as {
  __stores: Record<string, Map<string, unknown>>;
  __reset: () => void;
};

describe('KGConfigStorage', () => {
  let storage: KGConfigStorage;

  beforeEach(() => {
    idbMock.__reset();
    // Reset singleton for test isolation
    ;(KGConfigStorage as unknown as { _instance: undefined })._instance = undefined;
    storage = KGConfigStorage.getInstance();
  });

  it('saves and loads a config entry', async () => {
    await storage.save('testKey', { foo: 'bar' }, true);
    const result = await storage.load('testKey', Object);

    expect(result).toBeDefined();
    expect((result as Record<string, unknown>).foo).toBe('bar');
  });

  it('deletes a config entry', async () => {
    await storage.save('toDelete', { x: 1 }, true);
    await storage.delete('toDelete');
    const result = await storage.load('toDelete', Object);

    expect(result).toBeNull();
  });

  it('saveRaw and getRaw work for version markers', async () => {
    await storage.saveRaw('__config_version', { version: 1, upgradedAt: 123 });
    const raw = await storage.getRaw('__config_version');

    expect(raw).toBeDefined();
    expect(raw!.version).toBe(1);
  });

  it('getRaw returns null for non-existent key', async () => {
    const result = await storage.getRaw('nonexistent');
    expect(result).toBeNull();
  });

  it('returns singleton instance', () => {
    const a = KGConfigStorage.getInstance();
    const b = KGConfigStorage.getInstance();
    expect(a).toBe(b);
  });
});
