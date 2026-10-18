import { KGCore } from '../core/KGCore';
import { KGProject } from '../core/KGProject';
import { KGProjectStorage } from '../core/io/KGProjectStorage';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { clearChatHistoryAndUI } from '../util/chatUtil';
import { getEffectiveAgentMode } from '../util/agentMode';
import { isReservedProjectName, isValidProjectName, RESERVED_PROJECT_NAME } from '../util/projectNameUtil';
import type { BridgeResult, BridgeTool } from './protocol';

export interface McpToolEntry {
  definition: BridgeTool;
  internalName?: string;
  execute: (args: Record<string, unknown>, check: () => void) => Promise<BridgeResult>;
}

// Newly created projects have no saved snapshot yet, even if imported media created their directory.
const unsavedProjects = new WeakSet<KGProject>();

function requireName(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || !isValidProjectName(value)) {
    throw new Error('Provide a valid project name: letters, numbers, spaces, hyphens, underscores, periods, or parentheses; no leading/trailing spaces or leading period.');
  }
  if (isReservedProjectName(value)) throw new Error(`"${RESERVED_PROJECT_NAME}" is reserved. Provide a different project name.`);
  return value;
}

async function projectInfo(): Promise<Record<string, unknown>> {
  const project = KGCore.instance().getCurrentProject();
  const savedName = useProjectStore.getState().savedProjectName;
  const meta = await KGProjectStorage.getInstance().getMetadata(savedName);
  return {
    name: project.getName(), saved_name: meta && !meta.deletedAt ? meta.name : null,
    has_saved_snapshot: !!meta && !meta.deletedAt && !unsavedProjects.has(project),
    bpm: project.getBpm(), time_signature: project.getTimeSignature(), key_signature: project.getKeySignature(),
    max_bars: project.getMaxBars(), track_count: project.getTracks().length,
    playhead_tick: project.getPlayheadTick(), ticks_per_quarter_note: 960,
    agent_mode: getEffectiveAgentMode(), storage: 'browser OPFS (this origin and browser profile)',
  };
}

async function activateProject(project: KGProject, savedName: string, check: () => void): Promise<void> {
  const core = KGCore.instance();
  const store = useProjectStore.getState();
  if (store.isRecording) throw new Error('Stop recording in K.G.Studio before creating or opening a project.');
  const previous = core.getCurrentProject();
  const previousName = store.savedProjectName;
  await core.stop();
  check();
  store.cleanupProjectState();
  try {
    await store.loadProject(project, savedName, { throwOnError: true, suppressAlerts: true });
  } catch (error) {
    // Loading sets KGCore early; restore the old project rather than report a false success.
    core.setCurrentProject(previous);
    try { await store.loadProject(previous, previousName, { throwOnError: true, suppressAlerts: true }); } catch { /* Preserve the original load error. */ }
    throw error;
  }
  core.clearCommandHistory();
  clearChatHistoryAndUI();
  useProjectStore.getState().syncUndoRedoState();
}

function entry(name: string, description: string, readOnly: boolean, action: McpToolEntry['execute'], named = false): McpToolEntry {
  return {
    definition: {
      name, description,
      inputSchema: { type: 'object', properties: named ? { name: { type: 'string', description: 'Exact project name. Must be valid and cannot be the reserved name Untitled Project.' } } : {}, ...(named ? { required: ['name'] } : {}), additionalProperties: false },
      annotations: { readOnlyHint: readOnly },
    },
    execute: async (args, check) => {
      try { check(); return await action(args, check); }
      catch (error) { return { success: false, result: error instanceof Error ? error.message : String(error) }; }
    },
  };
}

export const MCP_PROJECT_TOOLS: McpToolEntry[] = [
  entry('get_current_project_info', 'Read metadata for the active browser project, its saved snapshot, musical settings, and effective agent mode. Does not include all notes or audio.', true,
    async () => ({ success: true, result: await projectInfo() })),
  entry('list_projects', 'List saved, non-deleted projects in this browser profile and origin, with creation/update timestamps. Does not list arbitrary local files or unsaved projects.', true,
    async () => ({ success: true, result: { projects: (await KGProjectStorage.getInstance().listWithMeta()).filter(meta => !isReservedProjectName(meta.name)) } })),
  entry('create_project', 'Create and activate a new unsaved project with the required unique name. Discards the current project\'s unsaved changes without confirmation. Untitled Project is reserved. Use save_project to persist the new project.', false,
    async (args, check) => {
      const name = requireName(args.name);
      if (KGCore.instance().getCurrentProject().getName() === name || await KGProjectStorage.getInstance().exists(name)) throw new Error(`Project "${name}" already exists. Choose a different name or use open_project.`);
      check();
      const project = new KGProject(name);
      project.setRightPanel(ConfigManager.instance().get('chatbox.default_open') ? 'musicAssistant' : null);
      await activateProject(project, name, check);
      unsavedProjects.add(project);
      return { success: true, result: await projectInfo() };
    }, true),
  entry('save_project', 'Save the current project using exactly its current name. Does not rename or generate a name. Returns an error for the reserved Untitled Project or a conflicting project. Saves to this browser\'s OPFS.', false,
    async (_args, check) => {
      const core = KGCore.instance();
      const project = core.getCurrentProject();
      if (isReservedProjectName(project.getName())) throw new Error(`"${RESERVED_PROJECT_NAME}" is reserved. Ask the user to rename the current project in K.G.Studio before calling save_project; this tool only saves under the current name.`);
      const name = requireName(project.getName());
      const savedName = useProjectStore.getState().savedProjectName;
      const storage = KGProjectStorage.getInstance();
      if (unsavedProjects.has(project) && await storage.getMetadata(name)) throw new Error(`Project "${name}" already exists. Saving would overwrite a different project.`);
      if (savedName !== name && await storage.exists(name)) throw new Error(`Project "${name}" already exists. Saving would overwrite a different project.`);
      check();
      if (savedName === name) await storage.save(name, project, true);
      else await storage.saveWithRename(savedName, name, project, false);
      unsavedProjects.delete(project);
      if (core.getCurrentProject() === project) useProjectStore.getState().setSavedProjectName(name);
      return { success: true, result: { name, saved: true, storage: 'browser OPFS' } };
    }),
  entry('open_project', 'Open and activate a saved, non-deleted project by exact name in this browser\'s OPFS. Discards current unsaved changes without confirmation. Returns an error if the project is missing or cannot load.', false,
    async (args, check) => {
      const name = requireName(args.name);
      const storage = KGProjectStorage.getInstance();
      const meta = await storage.getMetadata(name);
      if (!meta || meta.deletedAt) throw new Error(`Saved project "${name}" was not found in this browser's project library.`);
      const project = await storage.load(name);
      if (!project) throw new Error(`Project "${name}" could not be loaded.`);
      check();
      await activateProject(project, name, check);
      return { success: true, result: await projectInfo() };
    }, true),
];
