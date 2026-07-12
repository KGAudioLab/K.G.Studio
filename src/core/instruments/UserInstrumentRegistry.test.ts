import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserInstrumentRegistry } from './UserInstrumentRegistry';
import { resolveInstrumentDefinition, resolvePlaybackInstrument } from './instrumentResolver';

class MemoryFile {
  data: Blob = new Blob();
  async getFile() { return new File([this.data], 'file'); }
  async createWritable() {
    return { write: async (value: BlobPart) => { this.data = value instanceof Blob ? value : new Blob([value]); }, close: async () => undefined };
  }
}

class MemoryDirectory {
  entries = new Map<string, MemoryDirectory | MemoryFile>();
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    let value = this.entries.get(name);
    if (!value && options?.create) { value = new MemoryDirectory(); this.entries.set(name, value); }
    if (!(value instanceof MemoryDirectory)) throw new DOMException('', 'NotFoundError');
    return value;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    let value = this.entries.get(name);
    if (!value && options?.create) { value = new MemoryFile(); this.entries.set(name, value); }
    if (!(value instanceof MemoryFile)) throw new DOMException('', 'NotFoundError');
    return value;
  }
  async removeEntry(name: string) { if (!this.entries.delete(name)) throw new DOMException('', 'NotFoundError'); }
}

describe('UserInstrumentRegistry', () => {
  beforeEach(async () => {
    const root = new MemoryDirectory();
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: vi.fn(async () => root) } });
    await UserInstrumentRegistry.resetForTests();
  });

  it('creates permanent unique ids and sequential internal MIDI numbers', async () => {
    const first = await UserInstrumentRegistry.create('Hard Rock Guitar');
    const second = await UserInstrumentRegistry.create('Hard Rock Guitar');
    expect(first.instrumentId).toBe('hard_rock_guitar');
    expect(second.instrumentId).toBe('hard_rock_guitar_2');
    expect([first.midiInstrument, second.midiInstrument]).toEqual([1001, 1002]);
    await UserInstrumentRegistry.update(first.instrumentId, { displayName: 'Renamed Guitar' });
    expect(UserInstrumentRegistry.get(first.instrumentId)?.instrumentId).toBe('hard_rock_guitar');
  });

  it('requires an in-range sample before enabling and auto-disables after its deletion', async () => {
    const instrument = await UserInstrumentRegistry.create('Test Piano');
    await expect(UserInstrumentRegistry.update(instrument.instrumentId, { enabled: true })).rejects.toThrow('sample');
    await UserInstrumentRegistry.storeSample(instrument.instrumentId, 60, new File(['audio'], 'C4.wav', { type: 'audio/wav' }));
    await UserInstrumentRegistry.update(instrument.instrumentId, { enabled: true });
    expect(resolvePlaybackInstrument(instrument.instrumentId)).toBe(instrument.instrumentId);
    await UserInstrumentRegistry.deleteSample(instrument.instrumentId, 60);
    expect(UserInstrumentRegistry.get(instrument.instrumentId)?.enabled).toBe(false);
    expect(resolvePlaybackInstrument(instrument.instrumentId)).toBe('acoustic_grand_piano');
  });

  it('resolves custom metadata and missing ids to piano playback', async () => {
    const instrument = await UserInstrumentRegistry.create('My Synth');
    expect(resolveInstrumentDefinition(instrument.instrumentId)?.custom).toBe(true);
    expect(resolvePlaybackInstrument('not_installed')).toBe('acoustic_grand_piano');
  });
});
