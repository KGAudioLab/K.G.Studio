/**
 * Command system exports
 * Provides centralized access to command pattern classes
 */

export { KGCommand } from './KGCommand';
export { KGCommandHistory } from './KGCommandHistory';

// Track commands
export { AddTrackCommand } from './track/AddTrackCommand';
export { AddAudioTrackCommand } from './track/AddAudioTrackCommand';
export { RemoveTrackCommand } from './track/RemoveTrackCommand';
export { ReorderTracksCommand } from './track/ReorderTracksCommand';
export { UpdateTrackCommand, type TrackUpdateProperties } from './track/UpdateTrackCommand';
export {
  CreateTrackAutomationPointsCommand,
  type TrackAutomationPointCreationData,
} from './track/CreateTrackAutomationPointsCommand';
export { DeleteTrackAutomationPointsCommand } from './track/DeleteTrackAutomationPointsCommand';
export { UpdateTrackAutomationPointsCommand } from './track/UpdateTrackAutomationPointsCommand';

// Region commands
export { CreateRegionCommand } from './region/CreateRegionCommand';
export { DeleteRegionCommand, DeleteMultipleRegionsCommand } from './region/DeleteRegionCommand';
export { ResizeRegionCommand } from './region/ResizeRegionCommand';
export { MoveRegionCommand } from './region/MoveRegionCommand';
export { MoveMultipleRegionsCommand, ResizeMultipleRegionsCommand } from './region/TransformRegionsCommand';
export { PasteRegionsCommand } from './region/PasteRegionsCommand';
export { UpdateRegionCommand, type RegionUpdateProperties } from './region/UpdateRegionCommand';
export { ImportAudioCommand } from './region/ImportAudioCommand';
export { ImportMidiClipCommand } from './region/ImportMidiClipCommand';
export { ImportStemsCommand } from './region/ImportStemsCommand';
export type { StemImportEntry } from './region/ImportStemsCommand';
export { SplitRegionCommand } from './region/SplitRegionCommand';
export { MergeMidiRegionsCommand } from './region/MergeMidiRegionsCommand';

// Global region commands
export { CreateGlobalMarkerRegionCommand } from './global-region/CreateGlobalMarkerRegionCommand';
export { MoveGlobalRegionCommand } from './global-region/MoveGlobalRegionCommand';
export { ResizeGlobalRegionCommand, type GlobalRegionResizeEdge } from './global-region/ResizeGlobalRegionCommand';
export { DeleteGlobalRegionCommand, DeleteMultipleGlobalRegionsCommand } from './global-region/DeleteGlobalRegionCommand';
export { UpdateGlobalRegionTextCommand } from './global-region/UpdateGlobalRegionTextCommand';

// Note commands
export { CreateNoteCommand } from './note/CreateNoteCommand';
export { DeleteMidiEventsCommand } from './note/DeleteMidiEventsCommand';
export { DeleteNotesCommand, DeleteNoteCommand } from './note/DeleteNotesCommand';
export { ResizeNotesCommand } from './note/ResizeNotesCommand';
export { MoveNotesCommand } from './note/MoveNotesCommand';
export { PasteNotesCommand } from './note/PasteNotesCommand';
export { SplitSelectedNotesCommand } from './note/SplitSelectedNotesCommand';
export { UpdateNotePropertiesCommand } from './note/UpdateNotePropertiesCommand';
export { UpdatePitchBendPropertiesCommand } from './note/UpdatePitchBendPropertiesCommand';
export { UpdateControllerEventPropertiesCommand } from './note/UpdateControllerEventPropertiesCommand';
export {
  CreateMidiEventsCommand,
  type PitchBendCreationData,
  type NoteCreationData,
  type ControllerEventCreationData
} from './note/CreateMidiEventsCommand';

// Project commands
export { ChangeProjectPropertyCommand, type ProjectUpdateProperties } from './project/ChangeProjectPropertyCommand';
export { ChangeLoopSettingsCommand, type LoopSettings } from './project/ChangeLoopSettingsCommand';
