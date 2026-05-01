import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KGProjectStorage, DuplicateEntryError } from './KGProjectStorage';
import { KGProject } from '../KGProject';

// --- OPFS mock infrastructure ---

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
    // When stream closes, update our content
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

  async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
    if (!this.entries.has(name)) {
      throw new DOMException(`Entry "${name}" not found`, 'NotFoundError');
    }
    this.entries.delete(name);
  }

  async *values(): AsyncIterableIterator<MockFileSystemDirectoryHandle | MockFileSystemFileHandle> {
    for (const entry of this.entries.values()) {
      yield entry;
    }
  }
}

// Install the mock
const mockRoot = new MockFileSystemDirectoryHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(() => Promise.resolve(mockRoot)),
    persist: vi.fn(() => Promise.resolve(true)),
    estimate: vi.fn(() => Promise.resolve({ usage: 0, quota: 1e9 })),
  },
});

describe('KGProjectStorage', () => {
  let storage: KGProjectStorage;

  beforeEach(async () => {
    // Reset singleton and mock filesystem
    ;(KGProjectStorage as unknown as { _instance: undefined })._instance = undefined;
    // Clear the mock root directory entries
    const entries = (mockRoot as unknown as { entries: Map<string, unknown> }).entries;
    entries.clear();

    storage = KGProjectStorage.getInstance();
    await storage.initialize();
  });

  function createTestProject(name = 'Test Project'): KGProject {
    return new KGProject(name, 16, 0, 120);
  }

  it('initializes and creates the projects directory', async () => {
    // The projects directory should exist after init
    const projects = await mockRoot.getDirectoryHandle('projects');
    expect(projects).toBeDefined();
    expect(projects.kind).toBe('directory');
  });

  it('saves and loads a project', async () => {
    const project = createTestProject('My Song');
    await storage.save('My Song', project);

    const loaded = await storage.load('My Song');
    expect(loaded).not.toBeNull();
    expect(loaded!.getName()).toBe('My Song');
    expect(loaded!.getBpm()).toBe(120);
  });

  it('creates meta.json and media/ directory on save', async () => {
    const project = createTestProject('My Song');
    await storage.save('My Song', project);

    const projectsDir = await mockRoot.getDirectoryHandle('projects');
    const projectDir = await projectsDir.getDirectoryHandle('My Song');

    // meta.json should exist
    const metaHandle = await projectDir.getFileHandle('meta.json');
    const metaFile = await metaHandle.getFile();
    const meta = JSON.parse(await metaFile.text());
    expect(meta.name).toBe('My Song');
    expect(meta.createdAt).toBeGreaterThan(0);
    expect(meta.updatedAt).toBeGreaterThan(0);

    // media/ directory should exist
    const mediaDir = await projectDir.getDirectoryHandle('media');
    expect(mediaDir.kind).toBe('directory');
  });

  it('throws DuplicateEntryError when overwrite is false', async () => {
    const project = createTestProject('Duplicate');
    await storage.save('Duplicate', project);

    await expect(storage.save('Duplicate', project, false)).rejects.toThrow(DuplicateEntryError);
  });

  it('allows overwrite when overwrite is true', async () => {
    const project = createTestProject('Overwrite Test');
    await storage.save('Overwrite Test', project);

    project.setBpm(140);
    await storage.save('Overwrite Test', project, true);

    const loaded = await storage.load('Overwrite Test');
    expect(loaded!.getBpm()).toBe(140);
  });

  it('preserves createdAt on overwrite', async () => {
    const project = createTestProject('Preserve');
    await storage.save('Preserve', project);

    // Read the original createdAt
    const projectsDir = await mockRoot.getDirectoryHandle('projects');
    const projectDir = await projectsDir.getDirectoryHandle('Preserve');
    const metaHandle1 = await projectDir.getFileHandle('meta.json');
    const meta1 = JSON.parse(await (await metaHandle1.getFile()).text());

    // Save again (overwrite)
    await storage.save('Preserve', project, true);

    const metaHandle2 = await projectDir.getFileHandle('meta.json');
    const meta2 = JSON.parse(await (await metaHandle2.getFile()).text());

    expect(meta2.createdAt).toBe(meta1.createdAt);
    expect(meta2.updatedAt).toBeGreaterThanOrEqual(meta1.updatedAt);
  });

  it('lists project names', async () => {
    await storage.save('Alpha', createTestProject('Alpha'));
    await storage.save('Beta', createTestProject('Beta'));
    await storage.save('Charlie', createTestProject('Charlie'));

    const names = await storage.list();
    expect(names).toEqual(['Alpha', 'Beta', 'Charlie']);
  });

  it('checks if project exists', async () => {
    expect(await storage.exists('Nonexistent')).toBe(false);

    await storage.save('Exists', createTestProject('Exists'));
    expect(await storage.exists('Exists')).toBe(true);
  });

  it('deletes a project', async () => {
    await storage.save('ToDelete', createTestProject('ToDelete'));
    expect(await storage.exists('ToDelete')).toBe(true);

    await storage.delete('ToDelete');
    expect(await storage.exists('ToDelete')).toBe(false);
  });

  it('returns null for non-existent project on load', async () => {
    const result = await storage.load('Ghost');
    expect(result).toBeNull();
  });

  it('rejects invalid project names on save', async () => {
    const project = createTestProject();
    await expect(storage.save('my/song', project)).rejects.toThrow('Invalid project name');
    await expect(storage.save('my:song', project)).rejects.toThrow('Invalid project name');
    await expect(storage.save('', project)).rejects.toThrow('Invalid project name');
  });

  it('renames a project', async () => {
    await storage.save('Old Name', createTestProject('Old Name'));

    await storage.rename('Old Name', 'New Name');

    expect(await storage.exists('Old Name')).toBe(false);
    expect(await storage.exists('New Name')).toBe(true);

    const loaded = await storage.load('New Name');
    expect(loaded!.getName()).toBe('New Name');
  });
});
