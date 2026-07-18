import { beforeEach, describe, expect, it, vi } from 'vitest';

const debuggerMocks = vi.hoisted(() => ({
  selectedItems: [] as Array<Record<string, unknown>>,
  convertRegionToABCNotation: vi.fn(() => 'X:1\nC |'),
  playheadPosition: 0,
  beatsPerBar: 4,
}));

vi.mock('./KGCore', () => ({
  KGCore: {
    instance: () => ({
      getSelectedItems: () => debuggerMocks.selectedItems,
      getCurrentProject: () => ({
        getTimeSignature: () => ({ numerator: debuggerMocks.beatsPerBar, denominator: 4 }),
      }),
      getPlayheadPosition: () => debuggerMocks.playheadPosition,
    }),
  },
}));

vi.mock('./region/KGMidiRegion', () => ({
  KGMidiRegion: class {},
}));

vi.mock('../util/abcNotationUtil', () => ({
  convertRegionToABCNotation: debuggerMocks.convertRegionToABCNotation,
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

function createMockMidiRegion(startFromBeat = 4): Record<string, unknown> {
  return {
    getCurrentType: () => 'KGMidiRegion',
    getName: () => 'Test Region',
    getStartFromBeat: () => startFromBeat,
    getNotes: () => [],
  };
}

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

describe('KGDebugger ABC notation conversion', () => {
  let debuggerInstance: KGDebugger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (KGDebugger as unknown as { _instance: KGDebugger | null })._instance = null;
    debuggerMocks.selectedItems.length = 0;
    debuggerMocks.convertRegionToABCNotation.mockClear();
    debuggerMocks.playheadPosition = 0;
    debuggerMocks.beatsPerBar = 4;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    debuggerInstance = KGDebugger.instance();
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  it('preserves unbounded conversion when length is omitted', () => {
    const region = createMockMidiRegion();
    debuggerMocks.selectedItems.push(region);

    debuggerInstance.convertSelectedRegionToABCNotation(6);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 6);
  });

  it('converts through startFromBeat plus length', () => {
    const region = createMockMidiRegion();
    debuggerMocks.selectedItems.push(region);

    debuggerInstance.convertSelectedRegionToABCNotation(6, 8);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 6, 14);
  });

  it('forwards asCMajor while preserving the actual key signature header', () => {
    const region = createMockMidiRegion();
    debuggerMocks.selectedItems.push(region);

    debuggerInstance.convertSelectedRegionToABCNotation(6, 8, true);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 6, 14, true);
  });

  it('supports asCMajor for an unbounded conversion', () => {
    const region = createMockMidiRegion();
    debuggerMocks.selectedItems.push(region);

    debuggerInstance.convertSelectedRegionToABCNotation(6, undefined, true);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 6, undefined, true);
  });

  it('uses the region start when length is provided without startFromBeat', () => {
    const region = createMockMidiRegion(10);
    debuggerMocks.selectedItems.push(region);

    debuggerInstance.convertSelectedRegionToABCNotation(undefined, 4);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 10, 14);
  });

  it('uses the playhead rounded to its containing bar when startFromBeat is negative', () => {
    const region = createMockMidiRegion();
    debuggerMocks.selectedItems.push(region);
    debuggerMocks.playheadPosition = 7.6;

    debuggerInstance.convertSelectedRegionToABCNotation(-1, 4);

    expect(debuggerMocks.convertRegionToABCNotation).toHaveBeenCalledWith(region, 8, 12);
    expect(logSpy).toHaveBeenCalledWith('📍 Negative start requested; using playhead bar at beat: 8');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid length %s',
    (length) => {
      debuggerMocks.selectedItems.push(createMockMidiRegion());

      debuggerInstance.convertSelectedRegionToABCNotation(4, length);

      expect(errorSpy).toHaveBeenCalledWith('❌ Conversion length must be a positive, finite number.');
      expect(debuggerMocks.convertRegionToABCNotation).not.toHaveBeenCalled();
    },
  );
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
