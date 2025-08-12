// Base tool system
export { BaseTool } from './BaseTool';
export type { ToolResult, ToolParameter, ToolDefinition } from './BaseTool';

// Specific tools
import { AddNotesTool } from './AddNotesTool';
import { RemoveNotesTool } from './RemoveNotesTool';
import { ReadMusicTool } from './ReadMusicTool';
import { AttemptCompletionTool } from './AttemptCompletionTool';
import { ThinkingTool } from './ThinkingTool';
import { ThinkTool } from './ThinkTool';

export { AddNotesTool, RemoveNotesTool, ReadMusicTool, AttemptCompletionTool, ThinkingTool, ThinkTool };

// Tool registry for easy access
export const AVAILABLE_TOOLS = {
  add_notes: AddNotesTool,
  remove_notes: RemoveNotesTool,
  read_music: ReadMusicTool,
  attempt_completion: AttemptCompletionTool,
  thinking: ThinkingTool,
  think: ThinkTool
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;