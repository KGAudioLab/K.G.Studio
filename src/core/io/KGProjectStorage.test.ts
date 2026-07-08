import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KGProjectStorage, DuplicateEntryError } from './KGProjectStorage';
import { KGConversationStorage } from './KGConversationStorage';
import { KGProject } from '../KGProject';
import { GlobalTrackType } from '../global-track';
import { KGKeySignatureRegion } from '../region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../region/KGMarkerRegion';
import { KGChordRegion } from '../region/KGChordRegion';
import { KGTrack } from '../track/KGTrack';

// --- OPFS mock infrastructure ---

class MockFileSystemWritableFileStream {
  public data: string | ArrayBuffer = '';
  async write(content: string | ArrayBuffer) { this.data = content; }
  async close() {}
}

class MockFileSystemFileHandle {
  kind = 'file' as const;
  constructor(public name: string, private _content: string | ArrayBuffer = '') {}
  async getFile() {
    return {
      text: () => Promise.resolve(typeof this._content === 'string' ? this._content : new TextDecoder().decode(this._content)),
      arrayBuffer: () => Promise.resolve(
        typeof this._content === 'string'
          ? new TextEncoder().encode(this._content).buffer
          : this._content
      ),
    };
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
  let conversationStorage: KGConversationStorage;

  beforeEach(async () => {
    // Reset singleton and mock filesystem
    ;(KGProjectStorage as unknown as { _instance: undefined })._instance = undefined;
    // Clear the mock root directory entries
    const entries = (mockRoot as unknown as { entries: Map<string, unknown> }).entries;
    entries.clear();

    storage = KGProjectStorage.getInstance();
    await storage.initialize();
    ;(KGConversationStorage as unknown as { _instance: undefined })._instance = undefined;
    conversationStorage = KGConversationStorage.getInstance();
    await conversationStorage.initialize();
  });

  function createTestProject(name = 'Test Project'): KGProject {
    return new KGProject(name, 16, 0, 120);
  }

  it('defaults the main-grid zoom to 2 and piano-roll zoom to 1 on a fresh project', () => {
    const project = new KGProject();

    expect(project.getBarWidthMultiplier()).toBe(2);
    expect(project.getPianoRollZoom()).toBe(1);
  });

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

  it('preserves track mute and solo state when saving and loading', async () => {
    const track = new KGTrack('Track 1', 1);
    track.setMuted(true);
    track.setSolo(true);
    const project = new KGProject('My Song', 16, 0, 120, undefined, undefined, undefined, undefined, undefined, 1, [track], 11);

    await storage.save('My Song', project);

    const loaded = await storage.load('My Song');

    expect(loaded).not.toBeNull();
    expect(loaded!.getTracks()).toHaveLength(1);
    expect(loaded!.getTracks()[0].getMuted()).toBe(true);
    expect(loaded!.getTracks()[0].getSolo()).toBe(true);
  });

  it('preserves both main-grid and piano-roll zoom levels when saving and loading', async () => {
    const project = createTestProject('Zoom Song');
    project.setBarWidthMultiplier(3);
    project.setPianoRollZoom(5);

    await storage.save('Zoom Song', project);

    const loaded = await storage.load('Zoom Song');

    expect(loaded).not.toBeNull();
    expect(loaded!.getBarWidthMultiplier()).toBe(3);
    expect(loaded!.getPianoRollZoom()).toBe(5);
  });

  it('preserves playhead position when saving and loading', async () => {
    const project = createTestProject('Playhead Song');
    project.setPlayheadPosition(18.5);

    await storage.save('Playhead Song', project);

    const loaded = await storage.load('Playhead Song');

    expect(loaded).not.toBeNull();
    expect(loaded!.getPlayheadPosition()).toBe(18.5);
  });

  it('defaults playhead position to 0 when loading older project data without the field', async () => {
    const project = createTestProject('Legacy Song');
    await storage.save('Legacy Song', project);

    const projectsDir = await mockRoot.getDirectoryHandle('projects');
    const projectDir = await projectsDir.getDirectoryHandle('Legacy Song');
    const projectHandle = await projectDir.getFileHandle('project.json');
    const legacyPayload = JSON.parse(await (await projectHandle.getFile()).text()) as Record<string, unknown>;
    delete legacyPayload.playheadPosition;

    const writable = await projectHandle.createWritable();
    await writable.write(JSON.stringify(legacyPayload, null, 2));
    await writable.close();

    const loaded = await storage.load('Legacy Song');

    expect(loaded).not.toBeNull();
    expect(loaded!.getPlayheadPosition()).toBe(0);
  });

  it('preserves persisted global-track visibility and metronome state when saving and loading', async () => {
    const project = createTestProject('Toggle Song');
    project.setShowGlobalTracks(true);
    project.setIsMetronomeEnabled(true);

    await storage.save('Toggle Song', project);

    const loaded = await storage.load('Toggle Song');

    expect(loaded).not.toBeNull();
    expect(loaded!.getShowGlobalTracks()).toBe(true);
    expect(loaded!.getIsMetronomeEnabled()).toBe(true);
  });

  it('preserves global tracks and marker regions when saving and loading', async () => {
    const project = createTestProject('Marker Song');
    const markerTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Marker);

    expect(markerTrack).toBeDefined();
    markerTrack?.addRegion(new KGMarkerRegion('marker-1', markerTrack.getId(), markerTrack.getTrackIndex(), 'Intro', 0, 8));

    await storage.save('Marker Song', project);

    const loaded = await storage.load('Marker Song');
    const loadedMarkerTrack = loaded?.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Marker);

    expect(loadedMarkerTrack).toBeDefined();
    expect(loadedMarkerTrack?.getRegions()).toHaveLength(1);
    expect(loadedMarkerTrack?.getRegions()[0]).toBeInstanceOf(KGMarkerRegion);
    expect(loadedMarkerTrack?.getRegions()[0].getName()).toBe('Intro');
  });

  it('preserves key signature regions when saving and loading', async () => {
    const project = createTestProject('Signature Song');
    const signatureTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Signature);

    expect(signatureTrack).toBeDefined();
    signatureTrack?.addRegion(new KGKeySignatureRegion('signature-1', signatureTrack.getId(), signatureTrack.getTrackIndex(), 'G major', 4, 12, 4));

    await storage.save('Signature Song', project);

    const loaded = await storage.load('Signature Song');
    const loadedSignatureTrack = loaded?.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Signature);

    expect(loadedSignatureTrack).toBeDefined();
    expect(loadedSignatureTrack?.getRegions()).toHaveLength(1);
    expect(loadedSignatureTrack?.getRegions()[0]).toBeInstanceOf(KGKeySignatureRegion);
    expect((loadedSignatureTrack?.getRegions()[0] as KGKeySignatureRegion).getKeySignature()).toBe('G major');
    expect((loadedSignatureTrack?.getRegions()[0] as KGKeySignatureRegion).getStartBar()).toBe(4);
  });

  it('preserves chord regions when saving and loading', async () => {
    const project = createTestProject('Chord Song');
    const chordTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Chord);

    expect(chordTrack).toBeDefined();
    chordTrack?.addRegion(new KGChordRegion('chord-1', chordTrack.getId(), chordTrack.getTrackIndex(), 'Bm7b5', 5, 3));

    await storage.save('Chord Song', project);

    const loaded = await storage.load('Chord Song');
    const loadedChordTrack = loaded?.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Chord);

    expect(loadedChordTrack).toBeDefined();
    expect(loadedChordTrack?.getRegions()).toHaveLength(1);
    expect(loadedChordTrack?.getRegions()[0]).toBeInstanceOf(KGChordRegion);
    expect((loadedChordTrack?.getRegions()[0] as KGChordRegion).getSymbol()).toBe('Bm7b5');
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

  it('copies conversation history when saving under a new project name', async () => {
    await storage.save('Source Song', createTestProject('Source Song'));
    await conversationStorage.saveConversation('Source Song', {
      version: 1,
      conversationId: 'conv_1',
      continuationState: {
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1 }],
        todos: [],
      },
      fullHistory: {
        messages: [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1 }],
      },
      displayTranscript: [{ id: 'display_1', role: 'user', content: 'hello' }],
    }, {
      conversationId: 'conv_1',
      title: 'hello',
      createdAt: 1,
      updatedAt: 1,
      lastTurnAt: 1,
      messageCount: 1,
      preview: 'hello',
    });

    await storage.saveAs('Source Song', 'Copied Song', createTestProject('Copied Song'));

    const loadedConversation = await conversationStorage.loadConversation('Copied Song', 'conv_1');
    expect(loadedConversation?.document.conversationId).toBe('conv_1');
  });

  it('includes conversation history in project bundle export and import', async () => {
    await storage.save('Bundle Song', createTestProject('Bundle Song'));
    await conversationStorage.saveConversation('Bundle Song', {
      version: 1,
      conversationId: 'conv_bundle',
      continuationState: {
        messages: [{ id: 'm1', role: 'user', content: 'bundle', timestamp: 1 }],
        todos: [],
      },
      fullHistory: {
        messages: [{ id: 'm1', role: 'user', content: 'bundle', timestamp: 1 }],
      },
      displayTranscript: [{ id: 'display_1', role: 'user', content: 'bundle' }],
    }, {
      conversationId: 'conv_bundle',
      title: 'bundle',
      createdAt: 1,
      updatedAt: 1,
      lastTurnAt: 1,
      messageCount: 1,
      preview: 'bundle',
    });

    const bundle = await storage.exportAsZip('Bundle Song');
    const importedName = await storage.importFromZip(bundle);
    const loadedConversation = await conversationStorage.loadConversation(importedName, 'conv_bundle');

    expect(loadedConversation?.document.displayTranscript).toEqual([
      { id: 'display_1', role: 'user', content: 'bundle' },
    ]);
  });
});
