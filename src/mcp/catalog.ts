import type { AgentMode } from '../util/agentMode';
import { executeAvailableTool, getAvailableToolInstances } from '../agent/tools/toolExecution';
import { MCP_PROJECT_TOOLS, type McpToolEntry } from './projectTools';

const modes: AgentMode[] = ['regular', 'advanced', 'efficient'];
const qualifiedNames = new Set<string>();
const contracts = new Map<string, string>();
for (const mode of modes) {
  for (const tool of getAvailableToolInstances(mode)) {
    const contract = JSON.stringify(tool.getDefinition());
    if (contracts.has(tool.name) && contracts.get(tool.name) !== contract) qualifiedNames.add(tool.name);
    contracts.set(tool.name, contract);
  }
}

export function getMcpCatalog(mode: AgentMode): Map<string, McpToolEntry> {
  const entries: Array<[string, McpToolEntry]> = getAvailableToolInstances(mode).filter(tool => tool.name !== 'update_todo_list').map(tool => {
    const definition = tool.getDefinition().function;
    const name = qualifiedNames.has(tool.name) ? `${mode}_${tool.name}` : tool.name;
    return [name, { internalName: tool.name, execute: async (args, check) => {
      check();
      return executeAvailableTool(tool.name, args, mode);
    }, definition: {
      name,
      description: definition.description,
      inputSchema: definition.parameters,
      annotations: { readOnlyHint: tool.isReadOnlyTool() },
    } }];
  });
  entries.push(...MCP_PROJECT_TOOLS.map(entry => [entry.definition.name, entry] as [string, McpToolEntry]));
  return new Map(entries.sort(([a], [b]) => a.localeCompare(b)));
}
