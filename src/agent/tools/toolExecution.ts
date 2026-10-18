import type { AgentMode } from '../../util/agentMode';
import { AVAILABLE_TOOLS, createToolInstance } from './index';
import type { BaseTool, ToolPayload, ToolResult } from './BaseTool';
import { useProjectStore } from '../../stores/projectStore';

export function isToolAvailableInMode(tool: BaseTool<ToolPayload> | null, mode: AgentMode): boolean {
  if (!tool) return false;
  return mode === 'efficient' ? tool.isAvailableInEfficientMode()
    : mode === 'advanced' ? tool.isAvailableInAdvancedMode() : tool.isAvailableInRegularMode();
}

export function getAvailableToolInstances(mode: AgentMode): BaseTool<ToolPayload>[] {
  return Object.keys(AVAILABLE_TOOLS).map(name => createToolInstance(name, mode)!)
    .filter(tool => isToolAvailableInMode(tool, mode));
}

/** Shared execution path: keep command history and browser UI in sync for every caller. */
export async function executeAvailableTool(name: string, args: Record<string, unknown>, mode: AgentMode): Promise<ToolResult<ToolPayload>> {
  const tool = createToolInstance(name, mode);
  if (!tool) return { success: false, result: `Unknown tool: ${name}` };
  if (!isToolAvailableInMode(tool, mode)) return { success: false, result: `Tool '${name}' is not available in ${mode === 'efficient' ? 'Efficient Mode' : mode === 'advanced' ? 'Advanced Mode' : 'Regular Mode'}.` };
  try {
    const result = await tool.execute(args);
    if (result.success) useProjectStore.getState().refreshProjectState();
    return result;
  } catch (error) {
    return { success: false, result: `Tool execution failed: ${error}` };
  }
}
