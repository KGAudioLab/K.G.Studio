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
import { GetUserSelectedMusicRangeAndTrackTool } from './GetUserSelectedMusicRangeAndTrackTool';
import { ListAllTracksTool } from './ListAllTracksTool';
import { ListAllAvailableInstrumentsTool } from './ListAllAvailableInstrumentsTool';
import { CreateNewTrackTool } from './CreateNewTrackTool';
import { UpdateTrackTool } from './UpdateTrackTool';
import { DeleteTrackTool } from './DeleteTrackTool';

export {
  AddNotesTool,
  RemoveNotesTool,
  ReadMusicTool,
  ReadChordProgressionTool,
  UpdateTodoListTool,
  GetUserSelectedMusicRangeAndTrackTool,
  ListAllTracksTool,
  ListAllAvailableInstrumentsTool,
  CreateNewTrackTool,
  UpdateTrackTool,
  DeleteTrackTool,
};

// Tool registry for easy access
export const AVAILABLE_TOOLS = {
  update_todo_list: UpdateTodoListTool,
  add_notes: AddNotesTool,
  remove_notes: RemoveNotesTool,
  read_music: ReadMusicTool,
  read_chord_progression: ReadChordProgressionTool,
  get_user_selected_music_range_and_track: GetUserSelectedMusicRangeAndTrackTool,
  list_all_tracks: ListAllTracksTool,
  list_all_available_instruments: ListAllAvailableInstrumentsTool,
  create_new_track: CreateNewTrackTool,
  update_track: UpdateTrackTool,
  delete_track: DeleteTrackTool,
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;

export const createToolInstance = (toolName: string): BaseTool | null => {
  const ToolClass = AVAILABLE_TOOLS[toolName as ToolName];
  return ToolClass ? new ToolClass() : null;
};
