import { deserializeFXPreset, isValidFXPresetName, type FXPresetData } from '../fx/fxPresets';
import type { KGFX } from '../fx';

export interface FXPresetEntry { name: string; effects: KGFX[] | null }
export class FXPresetExistsError extends Error {}

export class FXPresetStorage {
  private async directory(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) throw new Error('OPFS unavailable');
    const root = await navigator.storage.getDirectory();
    const presets = await root.getDirectoryHandle('presets', { create: true });
    return presets.getDirectoryHandle('fx', { create: true });
  }
  private filename(name: string): string {
    if (!isValidFXPresetName(name)) throw new Error('Invalid FX preset name');
    return `${name}.json`;
  }
  async list(): Promise<FXPresetEntry[]> {
    const dir = await this.directory();
    const entries: FXPresetEntry[] = [];
    for await (const entry of dir.values()) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
      const name = entry.name.slice(0, -5);
      // Keep invalid files visible so they can be removed.
      try { entries.push({ name, effects: isValidFXPresetName(name) ? await this.readFile(dir, entry.name) : null }); }
      catch { entries.push({ name, effects: null }); }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }
  private async readFile(dir: FileSystemDirectoryHandle, filename: string): Promise<KGFX[]> {
    const file = await (await dir.getFileHandle(filename)).getFile();
    return deserializeFXPreset(JSON.parse(await file.text()));
  }
  async read(name: string): Promise<KGFX[]> { return this.readFile(await this.directory(), this.filename(name)); }
  async save(name: string, data: FXPresetData, overwrite = false): Promise<void> {
    const filename = this.filename(name);
    deserializeFXPreset(data);
    const dir = await this.directory();
    let exists = false;
    try { await dir.getFileHandle(filename); exists = true; }
    catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
    if (exists && !overwrite) throw new FXPresetExistsError(name);
    const handle = await dir.getFileHandle(filename, { create: true });
    let writable: FileSystemWritableFileStream | undefined;
    try {
      writable = await handle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
    } catch (error) {
      await writable?.abort().catch(() => {});
      if (!exists) await dir.removeEntry(filename).catch(() => {});
      throw error;
    }
  }
  async delete(name: string): Promise<void> {
    // Names from list() may be invalid/reserved; accept only a single filename component.
    if (name.includes('/') || name.includes('\\')) throw new Error('Invalid FX preset filename');
    await (await this.directory()).removeEntry(`${name}.json`);
  }
}
export const fxPresetStorage = new FXPresetStorage();
