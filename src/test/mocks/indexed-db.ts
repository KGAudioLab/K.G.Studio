/**
 * Mock implementation of IndexedDB for integration tests
 * Provides in-memory storage that mimics IndexedDB interface
 */
import { vi } from 'vitest'

// In-memory storage for tests
const mockStorage = new Map<string, any>()

export const mockIndexedDB = {
  openDB: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      put: vi.fn().mockImplementation((storeName: string, data: any, key?: string) => {
        const actualKey = key || data.id || 'default'
        mockStorage.set(`${storeName}:${actualKey}`, data)
        return Promise.resolve(actualKey)
      }),
      
      get: vi.fn().mockImplementation((storeName: string, key: string) => {
        return Promise.resolve(mockStorage.get(`${storeName}:${key}`))
      }),
      
      getAll: vi.fn().mockImplementation((storeName: string) => {
        const results: any[] = []
        for (const [key, value] of mockStorage.entries()) {
          if (key.startsWith(`${storeName}:`)) {
            results.push(value)
          }
        }
        return Promise.resolve(results)
      }),
      
      delete: vi.fn().mockImplementation((storeName: string, key: string) => {
        mockStorage.delete(`${storeName}:${key}`)
        return Promise.resolve()
      }),
      
      clear: vi.fn().mockImplementation((storeName: string) => {
        for (const key of mockStorage.keys()) {
          if (key.startsWith(`${storeName}:`)) {
            mockStorage.delete(key)
          }
        }
        return Promise.resolve()
      }),
      
      close: vi.fn().mockResolvedValue(undefined),
    })
  }),
}

// Helper function to clear mock storage between tests
export const clearMockStorage = () => {
  mockStorage.clear()
}