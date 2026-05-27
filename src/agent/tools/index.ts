// Base tool system
export { BaseTool } from './BaseTool';
export type { ToolResult, ToolParameter, ToolDefinition, OpenAIToolDefinition, OpenAIFunctionParameters } from './BaseTool';

// Specific tools
import { AddNotesTool } from './AddNotesTool';
import { RemoveNotesTool } from './RemoveNotesTool';
import { ReadMusicTool } from './ReadMusicTool';
import { ReadChordProgressionTool } from './ReadChordProgressionTool';

export { AddNotesTool, RemoveNotesTool, ReadMusicTool, ReadChordProgressionTool };

// Tool registry for easy access
export const AVAILABLE_TOOLS = {
  add_notes: AddNotesTool,
  remove_notes: RemoveNotesTool,
  read_music: ReadMusicTool,
  read_chord_progression: ReadChordProgressionTool,
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;
