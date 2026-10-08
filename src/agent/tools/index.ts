import type { AgentMode } from '../../util/agentMode';
import type { ToolPayload } from './BaseTool';
import { AdvancedReadMusicTool } from './AdvancedReadMusicTool';
import { AdvancedReadChordProgressionTool } from './AdvancedReadChordProgressionTool';
import { AdvancedReadBpmTool, AdvancedReadKeySignatureTool, AdvancedReadMarkersTool, AdvancedGetUserSelectedMusicRangeAndTrackTool } from './AdvancedTimelineReaders';
import { AdvancedTickEditorTool } from './AdvancedTickEditorTool';
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

const ADVANCED_READERS = {
  read_music: AdvancedReadMusicTool,
  read_chord_progression: AdvancedReadChordProgressionTool,
  read_bpm: AdvancedReadBpmTool,
  read_key_signature: AdvancedReadKeySignatureTool,
  read_markers: AdvancedReadMarkersTool,
  get_user_selected_music_range_and_track: AdvancedGetUserSelectedMusicRangeAndTrackTool,
} as const;

const TICK_EDITOR_NAMES = new Set<string>([
  'add_notes', 'remove_notes', 'write_chord_progression', 'remove_chord_progression',
  'write_markers', 'remove_markers', 'write_bpm', 'remove_bpm',
  'write_key_signature', 'remove_key_signature',
]);

export const createToolInstance = (toolName: string, mode: AgentMode = 'regular'): BaseTool<ToolPayload> | null => {
  // Own-key checks prevent arbitrary model-supplied names from resolving Object.prototype members.
  if (!Object.prototype.hasOwnProperty.call(AVAILABLE_TOOLS, toolName)) return null;
  if (mode === 'advanced' && Object.prototype.hasOwnProperty.call(ADVANCED_READERS, toolName)) {
    const Reader = ADVANCED_READERS[toolName as keyof typeof ADVANCED_READERS];
    return new Reader();
  }
  const ToolClass = AVAILABLE_TOOLS[toolName as ToolName];
  const tool = new ToolClass();
  return mode === 'advanced' && TICK_EDITOR_NAMES.has(toolName) ? new AdvancedTickEditorTool(tool) : tool;
};
