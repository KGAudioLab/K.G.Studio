import { describe, expect, it, vi } from 'vitest';
import { getMcpCatalog } from './catalog';
import { getAvailableToolInstances } from '../agent/tools/toolExecution';
import { MCP_PROJECT_TOOLS } from './projectTools';
import { AVAILABLE_TOOLS } from '../agent/tools';
import type { AgentMode } from '../util/agentMode';

vi.mock('../stores/projectStore', () => ({ useProjectStore: { getState: () => ({ refreshProjectState: vi.fn() }) } }));

describe('MCP tool catalog', () => {
  it.each<AgentMode>(['regular', 'advanced', 'efficient'])('mirrors %s availability except internal todos', mode => {
    const catalog = getMcpCatalog(mode);
    expect([...catalog.values()].filter(entry => entry.internalName).map(entry => entry.internalName).sort()).toEqual(
      getAvailableToolInstances(mode).filter(tool => tool.name !== 'update_todo_list').map(tool => tool.name).sort(),
    );
    expect([...catalog.keys()].some(name => name.includes('update_todo_list'))).toBe(false);
  });

  it('exposes all five project tools in every mode without adding them to the internal agent', () => {
    const names = ['get_current_project_info', 'create_project', 'list_projects', 'save_project', 'open_project'];
    expect(MCP_PROJECT_TOOLS.map(entry => entry.definition.name).sort()).toEqual([...names].sort());
    for (const mode of ['regular', 'advanced', 'efficient'] as const) {
      for (const name of names) {
        expect(getMcpCatalog(mode).has(name)).toBe(true);
        expect(Object.hasOwn(AVAILABLE_TOOLS, name)).toBe(false);
      }
    }
  });

  it('distinguishes incompatible timing contracts while preserving common tool names', () => {
    expect(getMcpCatalog('regular').has('regular_add_notes')).toBe(true);
    expect(getMcpCatalog('advanced').has('advanced_add_notes')).toBe(true);
    expect(getMcpCatalog('efficient').has('efficient_add_notes')).toBe(true);
    expect(getMcpCatalog('advanced').has('regular_add_notes')).toBe(false);
    expect(getMcpCatalog('regular').has('list_all_tracks')).toBe(false);
    expect(getMcpCatalog('advanced').has('advanced_list_all_tracks')).toBe(true);
    expect(getMcpCatalog('regular').has('create_new_track')).toBe(true);
  });
});
