// src/core/io/KGStorage.ts

import { openDB } from 'idb'
import type { IDBPDatabase } from 'idb'
import { plainToInstance, instanceToPlain } from 'class-transformer'
import { DB_CONSTANTS } from '../../constants/coreConstants'

export interface StorageEntry {
  name: string
  data: Record<string, unknown>
  lastModified: number
}

export class DuplicateEntryError extends Error {
  constructor(name: string) {
    super(`Entry "${name}" already exists`)
    this.name = 'DuplicateEntryError'
  }
}

export class KGStorage {
  private static instance: KGStorage
  private dbPromises: Map<string, Promise<IDBPDatabase>>

  private constructor() {
    this.dbPromises = new Map()
  }

  public static getInstance(): KGStorage {
    if (!KGStorage.instance) {
      KGStorage.instance = new KGStorage()
    }
    return KGStorage.instance
  }

  private getDB(dbName: string, _storeName: string, version: number = 1): Promise<IDBPDatabase> {
    const key = `${dbName}_${version}`
    
    if (!this.dbPromises.has(key)) {
      const dbPromise = openDB(dbName, version, {
        upgrade(db) {
          // Create all required object stores for this database
          const requiredStores = [
            DB_CONSTANTS.PROJECTS_STORE_NAME,
            DB_CONSTANTS.CONFIG_STORE_NAME
          ];
          
          for (const store of requiredStores) {
            if (!db.objectStoreNames.contains(store)) {
              db.createObjectStore(store, { keyPath: 'name' })
              console.log(`Created object store: ${store}`)
            }
          }
        },
      })
      this.dbPromises.set(key, dbPromise)
    }
    
    return this.dbPromises.get(key)!
  }

  public async save<T>(
    dbName: string, 
    storeName: string, 
    name: string, 
    data: T, 
    overwrite: boolean = false,
    version: number = 1
  ): Promise<void> {
    const db = await this.getDB(dbName, storeName, version)
    const existing = await db.get(storeName, name)
    if (existing && !overwrite) {
      throw new DuplicateEntryError(name)
    }
    const entry: StorageEntry = {
      name: name,
      data: instanceToPlain(data) as Record<string, unknown>,
      lastModified: Date.now(),
    }
    await db.put(storeName, entry)
  }

  public async load<T>(
    dbName: string,
    storeName: string,
    name: string,
    classType: new() => T,
    version: number = 1
  ): Promise<T | null> {
    try {
      const db = await this.getDB(dbName, storeName, version)
      const entry = await db.get(storeName, name)
      
      if (!entry?.data) {
        console.log(`No data found for entry "${name}" in store "${storeName}" of database "${dbName}"`)
        return null
      }
      
      const instance = plainToInstance(classType, entry.data)
      const loadedInstance = Array.isArray(instance) ? instance[0] || null : instance
      
      if (loadedInstance && typeof (loadedInstance as { setName?: (projectName: string) => void }).setName === 'function') {
        (loadedInstance as { setName: (projectName: string) => void }).setName(name)
      }
      
      return loadedInstance
    } catch (error) {
      console.log(`Error loading entry "${name}" from store "${storeName}" of database "${dbName}":`, error)
      return null
    }
  }

  public async list(
    dbName: string,
    storeName: string,
    version: number = 1
  ): Promise<string[]> {
    const db = await this.getDB(dbName, storeName, version)
    const all = await db.getAllKeys(storeName)
    return all as string[]
  }

  public async delete(
    dbName: string,
    storeName: string,
    name: string,
    version: number = 1
  ): Promise<void> {
    const db = await this.getDB(dbName, storeName, version)
    await db.delete(storeName, name)
  }
}