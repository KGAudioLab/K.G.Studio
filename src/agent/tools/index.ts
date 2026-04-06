// Base tool system
export { BaseTool } from './BaseTool';
export type { ToolResult, ToolParameter, ToolDefinition, OpenAIToolDefinition, OpenAIFunctionParameters } from './BaseTool';

// Specific tools
import { AddNotesTool } from './AddNotesTool';
import { RemoveNotesTool } from './RemoveNotesTool';
import { ReadMusicTool } from './ReadMusicTool';

export { AddNotesTool, RemoveNotesTool, ReadMusicTool };

// Tool registry for easy access
export const AVAILABLE_TOOLS = {
  add_notes: AddNotesTool,
  remove_notes: RemoveNotesTool,
  read_music: ReadMusicTool,
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;
