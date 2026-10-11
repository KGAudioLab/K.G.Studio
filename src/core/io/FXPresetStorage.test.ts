import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FXPresetStorage, FXPresetExistsError } from './FXPresetStorage';
import { serializeFXPreset, deserializeFXPreset, isValidFXPresetName } from '../fx/fxPresets';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from '../fx';

class FileHandle {
  kind = 'file'; content = ''; fail = false;
  constructor(public name: string) {}
  async getFile() { return { text: async () => this.content }; }
  async createWritable() {
    let pending = '';
    return { write: async (value: string) => { if (this.fail) throw new Error('quota'); pending = value; },
      close: async () => { this.content = pending; }, abort: vi.fn(async () => {}) };
  }
}
class Directory {
  kind = 'directory'; children = new Map<string, Directory | FileHandle>();
  constructor(public name: string) {}
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Directory> {
    if (!this.children.has(name) && options?.create) this.children.set(name, new Directory(name));
    const value = this.children.get(name); if (!(value instanceof Directory)) throw new DOMException('', 'NotFoundError'); return value;
  }
  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle> {
    if (!this.children.has(name) && options?.create) this.children.set(name, new FileHandle(name));
    const value = this.children.get(name); if (!(value instanceof FileHandle)) throw new DOMException('', 'NotFoundError'); return value;
  }
  async removeEntry(name: string) { this.children.delete(name); }
  async *values() { yield* this.children.values(); }
}
let root: Directory; let storage: FXPresetStorage;
beforeEach(() => {
  root = new Directory('root'); storage = new FXPresetStorage();
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: vi.fn(async () => root) } });
});
describe('FX preset storage', () => {
  it('creates the OPFS directory and round-trips ordered settings without IDs, independently', async () => {
    const effects = [new KGEQFX(), new KGReverbFX('plate', .63), new KGReverbFX('room', .21), new KGCompressorFX({ ratio: 7, gainDb: 4 }), new KGLimiterFX({ thresholdDb: -6 })];
    effects[1].setEnabled(false);
    const data = serializeFXPreset(effects);
    expect(data.effects.every(node => !('id' in node))).toBe(true);
    await storage.save('Warm FX', data);
    const dir = await (await root.getDirectoryHandle('presets')).getDirectoryHandle('fx');
    expect(JSON.parse((await dir.getFileHandle('Warm FX.json')).content)).toEqual(data);
    const copy = await storage.read('Warm FX');
    expect(serializeFXPreset(copy)).toEqual(data);
    expect(copy.every((effect, index) => effect.getId() !== effects[index].getId())).toBe(true);
    effects[1].setEnabled(true); expect(copy[1].getEnabled()).toBe(false);
    expect((await storage.list())[0].effects).toHaveLength(5);
  });
  it('allows empty and exact-case names, rejects reserved variants, and retains project conventions', async () => {
    for (const name of ['default', 'Default', ' DEFAULT ', '.hidden', 'bad/name', '中文', '']) expect(isValidFXPresetName(name)).toBe(false);
    for (const name of ['Untitled Project', ' Café (1) ', 'Chain.json', 'Chain']) expect(isValidFXPresetName(name)).toBe(true);
    await expect(storage.save('Default', serializeFXPreset([]))).rejects.toThrow();
    await storage.save('Chain', serializeFXPreset([])); await storage.save('chain', serializeFXPreset([]));
    expect(await storage.read('Chain')).toEqual([]); expect(await storage.list()).toHaveLength(2);
  });
  it('requires explicit overwrite and leaves existing data intact on a failed write', async () => {
    const original = serializeFXPreset([new KGReverbFX('spring', .9)]); const next = serializeFXPreset([]);
    await storage.save('Chain', original);
    await expect(storage.save('Chain', next)).rejects.toBeInstanceOf(FXPresetExistsError);
    expect(serializeFXPreset(await storage.read('Chain'))).toEqual(original);
    const dir = await (await root.getDirectoryHandle('presets')).getDirectoryHandle('fx');
    const file = await dir.getFileHandle('Chain.json'); file.fail = true;
    await expect(storage.save('Chain', next, true)).rejects.toThrow('quota'); expect(JSON.parse(file.content)).toEqual(original);
    file.fail = false; await storage.save('Chain', next, true); expect(await storage.read('Chain')).toEqual([]);
  });
  it('lists corrupt and unsupported presets as unavailable and permits deleting them', async () => {
    const dir = await (await root.getDirectoryHandle('presets', { create: true })).getDirectoryHandle('fx', { create: true });
    (await dir.getFileHandle('Broken.json', { create: true })).content = '{bad';
    (await dir.getFileHandle('Future.json', { create: true })).content = '{"version":2,"effects":[]}';
    await dir.getFileHandle('notes.txt', { create: true });
    expect(await storage.list()).toEqual([{ name: 'Broken', effects: null }, { name: 'Future', effects: null }]);
    await storage.delete('Broken'); expect(await storage.list()).toHaveLength(1);
    await expect(storage.delete('../Future')).rejects.toThrow();
    (await dir.getFileHandle('.json', { create: true })).content = '{}';
    expect((await storage.list()).find(entry => entry.name === '')?.effects).toBeNull();
    await storage.delete(''); expect(dir.children.has('.json')).toBe(false);
  });
  it('rejects malformed settings instead of silently substituting defaults', () => {
    const data = serializeFXPreset([new KGReverbFX()]);
    for (const effects of [[{}], [{ ...data.effects[0], wet: '0.5' }], [{ ...data.effects[0], wet: 2 }], [{ ...data.effects[0], enabled: undefined }], [{ ...data.effects[0], __type: 'Unknown' }]]) {
      expect(() => deserializeFXPreset({ version: 1, effects })).toThrow();
    }
  });
  it('reports OPFS unavailable', async () => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
    await expect(storage.list()).rejects.toThrow('OPFS unavailable');
  });
});
