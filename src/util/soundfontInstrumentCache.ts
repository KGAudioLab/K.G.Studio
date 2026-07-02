interface SoundfontCacheRootMetadata {
  baseUrl: string;
  updatedAt: string;
}

interface SoundfontInstrumentMetadata {
  complete: boolean;
  keys: string[];
  updatedAt: string;
}

export interface SoundfontCacheSummary {
  instrumentCount: number;
  instruments: string[];
}

const SOUND_FONT_ROOT_DIR = 'soundfont';
const FLUIDR3_DIR = 'FluidR3_GM';
const ROOT_METADATA_FILE = 'cache-metadata.json';
const INSTRUMENT_METADATA_FILE = 'instrument-metadata.json';

export class SoundfontInstrumentCache {
  public static async exists(instrumentName: string, expectedKeys: string[], baseUrl: string): Promise<boolean> {
    try {
      const rootDir = await this.ensureLibraryDir(baseUrl);
      const instrumentDir = await rootDir.getDirectoryHandle(instrumentName);
      const metadata = await this.readJson<SoundfontInstrumentMetadata>(instrumentDir, INSTRUMENT_METADATA_FILE);
      if (!metadata?.complete || !this.sameKeys(metadata.keys, expectedKeys)) {
        await this.deleteInstrument(instrumentName);
        return false;
      }

      for (const key of expectedKeys) {
        const handle = await instrumentDir.getFileHandle(`${key}.mp3`);
        const file = await handle.getFile();
        if (file.size <= 0) {
          await this.deleteInstrument(instrumentName);
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  public static async getInstrumentObjectUrls(
    instrumentName: string,
    expectedKeys: string[],
    baseUrl: string,
  ): Promise<Record<string, string>> {
    const rootDir = await this.ensureLibraryDir(baseUrl);
    const instrumentDir = await rootDir.getDirectoryHandle(instrumentName);
    const urls: Record<string, string> = {};

    for (const key of expectedKeys) {
      const fileHandle = await instrumentDir.getFileHandle(`${key}.mp3`);
      const file = await fileHandle.getFile();
      urls[key] = URL.createObjectURL(file);
    }

    return urls;
  }

  public static async storeInstrument(
    instrumentName: string,
    expectedKeys: string[],
    blobsByKey: Record<string, Blob>,
    baseUrl: string,
  ): Promise<void> {
    if (!this.sameKeys(Object.keys(blobsByKey), expectedKeys)) {
      throw new Error(`Cannot finalize soundfont cache for ${instrumentName}: incomplete key set.`);
    }

    const rootDir = await this.ensureLibraryDir(baseUrl);
    await this.removeIfExists(rootDir, instrumentName, true);
    const instrumentDir = await rootDir.getDirectoryHandle(instrumentName, { create: true });

    try {
      for (const key of expectedKeys) {
        const fileHandle = await instrumentDir.getFileHandle(`${key}.mp3`, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(blobsByKey[key]);
          await writable.close();
        } catch (error) {
          await writable.abort();
          throw error;
        }
      }

      const metadata: SoundfontInstrumentMetadata = {
        complete: true,
        keys: [...expectedKeys],
        updatedAt: new Date().toISOString(),
      };
      await this.writeJson(instrumentDir, INSTRUMENT_METADATA_FILE, metadata);
    } catch (error) {
      await this.removeIfExists(rootDir, instrumentName, true);
      throw error;
    }
  }

  public static async deleteInstrument(instrumentName: string): Promise<void> {
    try {
      const rootDir = await this.getLibraryDir(false);
      if (!rootDir) return;
      await this.removeIfExists(rootDir, instrumentName, true);
    } catch {
      // Ignore missing cache roots during cleanup.
    }
  }

  public static async deleteAll(): Promise<void> {
    try {
      const rootDir = await this.getLibraryDir(false);
      if (!rootDir) return;

      for await (const [name] of rootDir.entries()) {
        await this.removeIfExists(rootDir, name, true);
      }
    } catch {
      // Ignore cleanup failures for missing cache roots.
    }
  }

  public static async getCacheSummary(baseUrl: string): Promise<SoundfontCacheSummary> {
    const rootDir = await this.ensureLibraryDir(baseUrl);
    const instruments: string[] = [];

    for await (const [name, entry] of rootDir.entries()) {
      if (entry.kind !== 'directory') continue;

      try {
        const metadata = await this.readJson<SoundfontInstrumentMetadata>(entry, INSTRUMENT_METADATA_FILE);
        if (metadata?.complete) {
          instruments.push(name);
        }
      } catch {
        // Ignore broken entries in summary output.
      }
    }

    instruments.sort();
    return {
      instrumentCount: instruments.length,
      instruments,
    };
  }

  private static async ensureLibraryDir(baseUrl: string): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    const soundfontDir = await root.getDirectoryHandle(SOUND_FONT_ROOT_DIR, { create: true });
    const libraryDir = await soundfontDir.getDirectoryHandle(FLUIDR3_DIR, { create: true });
    const metadata = await this.readRootMetadata(libraryDir);

    if (!metadata || metadata.baseUrl !== baseUrl) {
      for await (const [name] of libraryDir.entries()) {
        await this.removeIfExists(libraryDir, name, true);
      }

      const nextMetadata: SoundfontCacheRootMetadata = {
        baseUrl,
        updatedAt: new Date().toISOString(),
      };
      await this.writeJson(libraryDir, ROOT_METADATA_FILE, nextMetadata);
    }

    return libraryDir;
  }

  private static async getLibraryDir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const soundfontDir = await root.getDirectoryHandle(SOUND_FONT_ROOT_DIR, { create });
      return await soundfontDir.getDirectoryHandle(FLUIDR3_DIR, { create });
    } catch {
      return null;
    }
  }

  private static async readRootMetadata(dir: FileSystemDirectoryHandle): Promise<SoundfontCacheRootMetadata | null> {
    try {
      return await this.readJson<SoundfontCacheRootMetadata>(dir, ROOT_METADATA_FILE);
    } catch {
      return null;
    }
  }

  private static async readJson<T>(dir: FileSystemDirectoryHandle, filename: string): Promise<T> {
    const handle = await dir.getFileHandle(filename);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as T;
  }

  private static async writeJson(dir: FileSystemDirectoryHandle, filename: string, value: unknown): Promise<void> {
    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(JSON.stringify(value, null, 2));
      await writable.close();
    } catch (error) {
      await writable.abort();
      throw error;
    }
  }

  private static sameKeys(actual: string[], expected: string[]): boolean {
    if (actual.length !== expected.length) return false;
    const expectedSet = new Set(expected);
    return actual.every(key => expectedSet.has(key));
  }

  private static async removeIfExists(
    dir: FileSystemDirectoryHandle,
    name: string,
    recursive: boolean = false,
  ): Promise<void> {
    try {
      await dir.removeEntry(name, recursive ? ({ recursive: true } as FileSystemRemoveOptions) : undefined);
    } catch {
      // Ignore missing entry cleanup.
    }
  }
}
