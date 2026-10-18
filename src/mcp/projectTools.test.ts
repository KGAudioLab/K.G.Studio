import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGProject } from '../core/KGProject';
import { MCP_PROJECT_TOOLS } from './projectTools';

const state = vi.hoisted(() => ({
  project: undefined as unknown, savedName: 'Untitled Project', recording: false,
  snapshots: new Map<string, unknown>(), folders: new Set<string>(),
  load: vi.fn(), save: vi.fn(), rename: vi.fn(), clearHistory: vi.fn(), clearChat: vi.fn(),
}));
vi.mock('../core/KGCore', () => ({ KGCore: { instance: () => ({
  getCurrentProject: () => state.project, setCurrentProject: (project: unknown) => { state.project = project; },
  stop: async () => {}, clearCommandHistory: state.clearHistory,
}) } }));
vi.mock('../stores/projectStore', () => ({ useProjectStore: { getState: () => ({
  savedProjectName: state.savedName, isRecording: state.recording, loadProject: state.load,
  cleanupProjectState: () => {}, syncUndoRedoState: () => {},
  setSavedProjectName: (name: string) => { state.savedName = name; },
}) } }));
vi.mock('../core/io/KGProjectStorage', () => ({ KGProjectStorage: { getInstance: () => ({
  exists: async (name: string) => state.folders.has(name),
  listWithMeta: async () => [...state.snapshots.keys()].map(name => ({ name, createdAt: 1, updatedAt: 2 })),
  getMetadata: async (name: string) => state.snapshots.has(name) ? { name, createdAt: 1, updatedAt: 2 } : null,
  load: async (name: string) => state.snapshots.get(name) ?? null,
  save: state.save, saveWithRename: state.rename,
}) } }));
vi.mock('../core/config/ConfigManager', () => ({ ConfigManager: { instance: () => ({ get: () => false }) } }));
vi.mock('../util/agentMode', () => ({ getEffectiveAgentMode: () => 'efficient' }));
vi.mock('../util/chatUtil', () => ({ clearChatHistoryAndUI: state.clearChat }));

const call = (name: string, args: Record<string, unknown> = {}, check = () => {}) => MCP_PROJECT_TOOLS.find(tool => tool.definition.name === name)!.execute(args, check);

beforeEach(() => {
  vi.clearAllMocks();
  state.project = new KGProject();
  state.savedName = 'Untitled Project';
  state.recording = false;
  state.snapshots.clear();
  state.folders.clear();
  state.load.mockImplementation(async (project: KGProject, savedName: string) => { state.project = project; state.savedName = savedName; });
  state.save.mockImplementation(async (name: string, project: KGProject) => { state.snapshots.set(name, project); state.folders.add(name); });
});

describe('MCP-only project tools', () => {
  it('requires a valid non-reserved name without replacing the current project', async () => {
    const original = state.project;
    for (const name of [undefined, '', 'Untitled Project', '../bad', 'bad/name', ' name ']) {
      expect((await call('create_project', { name })).success).toBe(false);
      expect(state.project).toBe(original);
    }
    expect(state.load).not.toHaveBeenCalled();
  });

  it('rejects duplicate project names including existing media folders', async () => {
    state.folders.add('Existing');
    expect(await call('create_project', { name: 'Existing' })).toMatchObject({ success: false, result: expect.stringContaining('already exists') });
    expect(state.load).not.toHaveBeenCalled();
  });

  it('creates an active unsaved project and saves with exactly that name', async () => {
    const created = await call('create_project', { name: 'My song' });
    expect(created).toMatchObject({ success: true, result: { name: 'My song', has_saved_snapshot: false } });
    expect(state.save).not.toHaveBeenCalled();
    expect(await call('create_project', { name: 'My song' })).toMatchObject({ success: false, result: expect.stringContaining('already exists') });
    expect(state.clearHistory).toHaveBeenCalledOnce();
    expect(state.clearChat).toHaveBeenCalledOnce();
    expect(await call('list_projects')).toMatchObject({ result: { projects: [] } });
    expect(await call('save_project')).toMatchObject({ success: true, result: { name: 'My song', saved: true } });
    expect(state.save).toHaveBeenCalledWith('My song', state.project, true);
    expect(await call('get_current_project_info')).toMatchObject({ result: { name: 'My song', has_saved_snapshot: true, agent_mode: 'efficient' } });
  });

  it('refuses to save Untitled Project without generating a new name', async () => {
    expect(await call('save_project')).toMatchObject({ success: false, result: expect.stringContaining('reserved') });
    expect(state.save).not.toHaveBeenCalled();
    expect(state.rename).not.toHaveBeenCalled();
  });

  it('does not overwrite a different project that appeared after creation', async () => {
    await call('create_project', { name: 'Concurrent' });
    state.snapshots.set('Concurrent', new KGProject('Concurrent'));
    expect(await call('save_project')).toMatchObject({ success: false, result: expect.stringContaining('overwrite a different project') });
    expect(state.save).not.toHaveBeenCalled();
  });

  it('opens an existing project and rejects missing projects without switching', async () => {
    const original = state.project;
    expect((await call('open_project', { name: 'Missing' })).success).toBe(false);
    expect(state.project).toBe(original);
    const saved = new KGProject('Existing');
    state.snapshots.set('Existing', saved);
    expect(await call('open_project', { name: 'Existing' })).toMatchObject({ success: true, result: { name: 'Existing', saved_name: 'Existing' } });
    expect(state.project).toBe(saved);
    expect(state.load).toHaveBeenCalledWith(saved, 'Existing', { throwOnError: true, suppressAlerts: true });
  });

  it('reports a failed project load and restores the previous project', async () => {
    const previous = state.project;
    state.snapshots.set('Broken', new KGProject('Broken'));
    state.load.mockImplementationOnce(async () => { state.project = {}; throw new Error('Audio setup failed'); });
    expect(await call('open_project', { name: 'Broken' })).toMatchObject({ success: false, result: 'Audio setup failed' });
    expect(state.project).toBe(previous);
    expect(state.clearChat).not.toHaveBeenCalled();
  });

  it('reports save failures without a dialog or a success result', async () => {
    await call('create_project', { name: 'Save failure' });
    state.save.mockRejectedValueOnce(new Error('Storage quota exceeded'));
    expect(await call('save_project')).toMatchObject({ success: false, result: 'Storage quota exceeded' });
    expect(await call('get_current_project_info')).toMatchObject({ result: { has_saved_snapshot: false } });
  });

  it('rechecks request validity after asynchronous project lookup', async () => {
    const check = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('MCP disabled'); });
    expect(await call('create_project', { name: 'Stale' }, check)).toMatchObject({ success: false, result: 'MCP disabled' });
    expect(state.load).not.toHaveBeenCalled();
  });
});
