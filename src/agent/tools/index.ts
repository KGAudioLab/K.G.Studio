// Base tool system
import { BaseTool } from './BaseTool';
export { BaseTool } from './BaseTool';
export type { ToolResult, ToolParameter, ToolDefinition, OpenAIToolDefinition, OpenAIFunctionParameters } from './BaseTool';

// Specific tools
import { AddNotesTool } from './AddNotesTool';
import { RemoveNotesTool } from './RemoveNotesTool';
import { ReadMusicTool } from './ReadMusicTool';
import { ReadChordProgressionTool } from './ReadChordProgressionTool';
import { UpdateTodoListTool } from './UpdateTodoListTool';

export { AddNotesTool, RemoveNotesTool, ReadMusicTool, ReadChordProgressionTool, UpdateTodoListTool };

// Tool registry for easy access
export const AVAILABLE_TOOLS = {
  update_todo_list: UpdateTodoListTool,
  add_notes: AddNotesTool,
  remove_notes: RemoveNotesTool,
  read_music: ReadMusicTool,
  read_chord_progression: ReadChordProgressionTool,
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;

export const createToolInstance = (toolName: string): BaseTool | null => {
  const ToolClass = AVAILABLE_TOOLS[toolName as ToolName];
  return ToolClass ? new ToolClass() : null;
};
