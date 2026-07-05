import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./KGCore', () => ({
  KGCore: {
    instance: () => ({
      getSelectedItems: () => [],
      getCurrentProject: () => ({}),
    }),
  },
}));

vi.mock('./region/KGMidiRegion', () => ({
  KGMidiRegion: class {},
}));

vi.mock('../util/abcNotationUtil', () => ({
  convertRegionToABCNotation: vi.fn(),
  convertBeatRangeChordProgressionToABCNotation: vi.fn(),
}));

vi.mock('../util/xmlUtil', () => ({
  extractXMLFromString: vi.fn(),
}));

vi.mock('../agent/core/AgentCore', () => ({
  AgentCore: class {},
}));

vi.mock('../agent/tools', () => ({
  AVAILABLE_TOOLS: {},
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      activeRegionId: null,
      tracks: [],
    }),
  },
}));

import { KGDebugger } from './KGDebugger';

class MockFileSystemFileHandle {
  public kind = 'file' as const;

  constructor(
    public name: string,
    private readonly content: string,
    private readonly lastModified: number = Date.now(),
  ) {}

  async getFile(): Promise<File> {
    return new File([this.content], this.name, { lastModified: this.lastModified });
  }
}

class MockFileSystemDirectoryHandle {
  public kind = 'directory' as const;
  private readonly children = new Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>();

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemDirectoryHandle> {
    let child = this.children.get(name);
    if (!child || child.kind !== 'directory') {
      if (!options?.create) {
        throw new DOMException(`Directory "${name}" not found`, 'NotFoundError');
      }
      child = new MockFileSystemDirectoryHandle(name);
      this.children.set(name, child);
    }
    return child;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileSystemFileHandle> {
    let child = this.children.get(name);
    if (!child || child.kind !== 'file') {
      if (!options?.create) {
        throw new DOMException(`File "${name}" not found`, 'NotFoundError');
      }
      child = new MockFileSystemFileHandle(name, '');
      this.children.set(name, child);
    }
    return child;
  }

  addDirectory(name: string): MockFileSystemDirectoryHandle {
    const dir = new MockFileSystemDirectoryHandle(name);
    this.children.set(name, dir);
    return dir;
  }

  addFile(name: string, content: string): MockFileSystemFileHandle {
    const file = new MockFileSystemFileHandle(name, content);
    this.children.set(name, file);
    return file;
  }

  async *values(): AsyncIterableIterator<MockFileSystemDirectoryHandle | MockFileSystemFileHandle> {
    for (const child of this.children.values()) {
      yield child;
    }
  }
}

const mockRoot = new MockFileSystemDirectoryHandle('root');

vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    getDirectory: vi.fn(() => Promise.resolve(mockRoot)),
  },
});

describe('KGDebugger OPFS du', () => {
  let debuggerInstance: KGDebugger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (KGDebugger as unknown as { _instance: KGDebugger | null })._instance = null;
    const children = (mockRoot as unknown as {
      children: Map<string, MockFileSystemDirectoryHandle | MockFileSystemFileHandle>;
    }).children;
    children.clear();

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    debuggerInstance = KGDebugger.instance();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  it('reports 0 for an empty current directory', async () => {
    await debuggerInstance.opfs('du');

    expect(logSpy).toHaveBeenCalledWith('0  .');
  });

  it('reports file sizes for direct children in the current directory', async () => {
    mockRoot.addFile('beat.txt', '12345');
    mockRoot.addFile('melody.mid', '123456789');

    await debuggerInstance.opfs('du');

    expect(logSpy.mock.calls).toEqual([
      ['5  beat.txt'],
      ['9  melody.mid'],
    ]);
  });

  it('reports recursive directory sizes and appends trailing slashes', async () => {
    const projects = mockRoot.addDirectory('projects');
    projects.addFile('meta.json', '{}');
    const media = projects.addDirectory('media');
    media.addFile('take.wav', '1234567');

    await debuggerInstance.opfs('du');

    expect(logSpy).toHaveBeenCalledWith('9  projects/');
  });

  it('supports relative and absolute paths', async () => {
    const songs = mockRoot.addDirectory('songs');
    const demos = songs.addDirectory('demos');
    demos.addFile('idea.txt', '1234');

    await debuggerInstance.opfs('cd songs');
    logSpy.mockClear();

    await debuggerInstance.opfs('du demos');
    await debuggerInstance.opfs('du /songs/demos');

    expect(logSpy.mock.calls).toEqual([
      ['4  demos/'],
      ['4  demos/'],
    ]);
  });

  it('keeps ls output unchanged for directories', async () => {
    mockRoot.addDirectory('archive');
    mockRoot.addFile('notes.txt', '1234');

    await debuggerInstance.opfs('ls');

    expect(logSpy.mock.calls).toContainEqual(['total 2  (/)']);
    expect(logSpy.mock.calls).toContainEqual(['drwxr-xr-x     -  -  archive/']);
    expect(logSpy.mock.calls).toContainEqual([expect.stringMatching(/^-rw-r--r--\s+4\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+notes\.txt$/)]);
  });

  it('reports missing paths with the du-specific error message', async () => {
    await debuggerInstance.opfs('du missing');

    expect(errorSpy).toHaveBeenCalledWith('opfs: du: no such file or directory: missing');
  });
});
