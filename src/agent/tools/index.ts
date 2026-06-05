// Base tool system
import { BaseTool } from './BaseTool';
export { BaseTool } from './BaseTool';
export type { ToolResult, ToolParameter, ToolDefinition, OpenAIToolDefinition, OpenAIFunctionParameters } from './BaseTool';

// Specific tools
import { AddNotesTool } from './AddNotesTool';
import { RemoveNotesTool } from './RemoveNotesTool';
import { RemoveChordProgressionTool } from './RemoveChordProgressionTool';
import { RemoveMarkersTool } from './RemoveMarkersTool';
import { RemoveKeySignatureTool } from './RemoveKeySignatureTool';
import { RemoveBpmTool } from './RemoveBpmTool';
import { ReadMusicTool } from './ReadMusicTool';
import { ReadMarkersTool } from './ReadMarkersTool';
import { ReadChordProgressionTool } from './ReadChordProgressionTool';
import { WriteChordProgressionTool } from './WriteChordProgressionTool';
import { WriteMarkersTool } from './WriteMarkersTool';
import { ReadKeySignatureTool } from './ReadKeySignatureTool';
import { ReadBpmTool } from './ReadBpmTool';
import { WriteKeySignatureTool } from './WriteKeySignatureTool';
import { WriteBpmTool } from './WriteBpmTool';
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
  RemoveChordProgressionTool,
  RemoveMarkersTool,
  RemoveKeySignatureTool,
  RemoveBpmTool,
  ReadMusicTool,
  ReadMarkersTool,
  ReadChordProgressionTool,
  WriteChordProgressionTool,
  WriteMarkersTool,
  ReadKeySignatureTool,
  ReadBpmTool,
  WriteKeySignatureTool,
  WriteBpmTool,
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
  remove_chord_progression: RemoveChordProgressionTool,
  remove_markers: RemoveMarkersTool,
  remove_key_signature: RemoveKeySignatureTool,
  remove_bpm: RemoveBpmTool,
  read_music: ReadMusicTool,
  read_markers: ReadMarkersTool,
  read_chord_progression: ReadChordProgressionTool,
  write_chord_progression: WriteChordProgressionTool,
  write_markers: WriteMarkersTool,
  read_key_signature: ReadKeySignatureTool,
  read_bpm: ReadBpmTool,
  write_key_signature: WriteKeySignatureTool,
  write_bpm: WriteBpmTool,
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
