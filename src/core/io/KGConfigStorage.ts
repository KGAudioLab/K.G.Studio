import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { DB_CONSTANTS } from '../../constants/coreConstants';

interface ConfigStorageEntry {
  name: string;
  data: Record<string, unknown>;
  lastModified: number;
}

/**
 * KGConfigStorage — IndexedDB-backed storage for application configuration.
 * Extracted from the former KGStorage class; only manages the config object store.
 */
export class KGConfigStorage {
  private static _instance: KGConfigStorage;
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private constructor() {}

  public static getInstance(): KGConfigStorage {
    if (!KGConfigStorage._instance) {
      KGConfigStorage._instance = new KGConfigStorage();
    }
    return KGConfigStorage._instance;
  }

  private getDB(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(DB_CONSTANTS.DB_NAME, DB_CONSTANTS.DB_VERSION, {
        upgrade(db) {
          // Create required object stores if they don't exist
          const requiredStores = [
            DB_CONSTANTS.PROJECTS_STORE_NAME,
            DB_CONSTANTS.CONFIG_STORE_NAME,
          ];
          for (const store of requiredStores) {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store, { keyPath: 'name' });
              console.log(`Created object store: ${store}`);
            }
          }
        },
      });
    }
    return this.dbPromise;
  }

  public async save(name: string, data: unknown, overwrite: boolean = true): Promise<void> {
    const db = await this.getDB();
    const storeName = DB_CONSTANTS.CONFIG_STORE_NAME;

    if (!overwrite) {
      const existing = await db.get(storeName, name);
      if (existing) {
        throw new Error(`Config entry "${name}" already exists`);
      }
    }

    const entry: ConfigStorageEntry = {
      name,
      data: instanceToPlain(data) as Record<string, unknown>,
      lastModified: Date.now(),
    };
    await db.put(storeName, entry);
  }

  public async load<T>(name: string, classType: new () => T): Promise<T | null> {
    try {
      const db = await this.getDB();
      const entry = await db.get(DB_CONSTANTS.CONFIG_STORE_NAME, name);

      if (!entry?.data) {
        return null;
      }

      const instance = plainToInstance(classType, entry.data);
      return Array.isArray(instance) ? instance[0] || null : instance;
    } catch (error) {
      console.error(`Error loading config entry "${name}":`, error);
      return null;
    }
  }

  public async delete(name: string): Promise<void> {
    const db = await this.getDB();
    await db.delete(DB_CONSTANTS.CONFIG_STORE_NAME, name);
  }

  /**
   * Get a raw value from the config store (no class-transformer deserialization).
   * Used by KGConfigUpgrader to read the config version marker.
   */
  public async getRaw(name: string): Promise<Record<string, unknown> | null> {
    try {
      const db = await this.getDB();
      const entry = await db.get(DB_CONSTANTS.CONFIG_STORE_NAME, name);
      return entry?.data ?? null;
    } catch (error) {
      console.error(`Error loading raw config entry "${name}":`, error);
      return null;
    }
  }

  /**
   * Save a raw value to the config store (no class-transformer serialization).
   * Used by KGConfigUpgrader to write the config version marker.
   */
  public async saveRaw(name: string, data: Record<string, unknown>): Promise<void> {
    const db = await this.getDB();
    const entry: ConfigStorageEntry = {
      name,
      data,
      lastModified: Date.now(),
    };
    await db.put(DB_CONSTANTS.CONFIG_STORE_NAME, entry);
  }
}
