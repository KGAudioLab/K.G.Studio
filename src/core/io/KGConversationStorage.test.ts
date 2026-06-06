import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGConversationStorage } from './KGConversationStorage';

class MockFileSystemWritableFileStream {
  public data = '';
  async write(content: string) { this.data = content; }
  async close() {}
}

class MockFileSystemFileHandle {
  kind = 'file' as const;
  constructor(public name: string, private _content: string = '') {}
  async getFile() {
    return { text: () => Promise.resolve(this._content) };
  }
  async createWritable() {
    const stream = new MockFileSystemWritableFileStream();
    const origClose = stream.close.bind(stream);
    stream.close = async () => {
      this._content = stream.data;
      await origClose();
    };
    return stream;
  }
}

class MockFileSystemDirectoryHandle {
  kind = 'directory' as const;
  private entries = new Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>();

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemDirectoryHandle> {
    let entry = this.entries.get(name);
    if (!entry || entry.kind !== 'directory') {
      if (options?.create) {
        entry = new MockFileSystemDirectoryHandle(name);
        this.entries.set(name, entry);
      } else {
        throw new DOMException(`Directory "${name}" not found`, 'NotFoundError');
      }
    }
    return entry as MockFileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemFileHandle> {
    let entry = this.entries.get(name);
    if (!entry || entry.kind !== 'file') {
      if (options?.create) {
        entry = new MockFileSystemFileHandle(name);
        this.entries.set(name, entry);
      } else {
        throw new DOMException(`File "${name}" not found`, 'NotFoundError');
      }
    }
    return entry as MockFileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    this.entries.delete(name);
  }

  async *values(): AsyncIterableIterator<MockFileSystemDirectoryHandle | MockFileSystemFileHandle> {
    for (const entry of this.entries.values()) {
      yield entry;
    }
  }
}

const mockRoot = new MockFileSystemDirectoryHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(() => Promise.resolve(mockRoot)),
    persist: vi.fn(() => Promise.resolve(true)),
  },
});

describe('KGConversationStorage', () => {
  let storage: KGConversationStorage;

  beforeEach(async () => {
    ;(KGConversationStorage as unknown as { _instance: undefined })._instance = undefined;
    const entries = (mockRoot as unknown as { entries: Map<string, unknown> }).entries;
    entries.clear();

    storage = KGConversationStorage.getInstance();
    await storage.initialize();
  });

  it('saves, lists, and loads project-scoped conversations sorted by last turn time', async () => {
    await storage.saveConversation('Song A', {
      version: 1,
      conversationId: 'conv_1',
      continuationState: {
        messages: [{ id: 'm1', role: 'user', content: 'first', timestamp: 1 }],
        todos: [],
      },
      fullHistory: {
        messages: [{ id: 'm1', role: 'user', content: 'first', timestamp: 1 }],
      },
      displayTranscript: [{ id: 'display_1', role: 'user', content: 'first' }],
    }, {
      conversationId: 'conv_1',
      title: 'First',
      createdAt: 1,
      updatedAt: 1,
      lastTurnAt: 1,
      messageCount: 1,
      preview: 'first',
    });

    await storage.saveConversation('Song A', {
      version: 1,
      conversationId: 'conv_2',
      continuationState: {
        messages: [{ id: 'm2', role: 'user', content: 'second', timestamp: 2 }],
        todos: [],
      },
      fullHistory: {
        messages: [{ id: 'm2', role: 'user', content: 'second', timestamp: 2 }],
      },
      displayTranscript: [{ id: 'display_2', role: 'user', content: 'second' }],
    }, {
      conversationId: 'conv_2',
      title: 'Second',
      createdAt: 2,
      updatedAt: 2,
      lastTurnAt: 2,
      messageCount: 1,
      preview: 'second',
    });

    const listed = await storage.listConversations('Song A');
    expect(listed.map(item => item.conversationId)).toEqual(['conv_2', 'conv_1']);

    const loaded = await storage.loadConversation('Song A', 'conv_1');
    expect(loaded?.document.conversationId).toBe('conv_1');
    expect(loaded?.document.displayTranscript).toEqual([
      { id: 'display_1', role: 'user', content: 'first' },
    ]);
  });
});
