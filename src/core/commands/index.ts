/**
 * Command system exports
 * Provides centralized access to command pattern classes
 */

export { KGCommand } from './KGCommand';
export { KGCommandHistory } from './KGCommandHistory';

// Track commands
export { AddTrackCommand } from './track/AddTrackCommand';
export { RemoveTrackCommand } from './track/RemoveTrackCommand';
export { ReorderTracksCommand } from './track/ReorderTracksCommand';
export { UpdateTrackCommand, type TrackUpdateProperties } from './track/UpdateTrackCommand';

// Region commands
export { CreateRegionCommand } from './region/CreateRegionCommand';
export { DeleteRegionCommand, DeleteMultipleRegionsCommand } from './region/DeleteRegionCommand';
export { ResizeRegionCommand } from './region/ResizeRegionCommand';
export { MoveRegionCommand } from './region/MoveRegionCommand';
export { PasteRegionsCommand } from './region/PasteRegionsCommand';
export { UpdateRegionCommand, type RegionUpdateProperties } from './region/UpdateRegionCommand';

// Note commands
export { CreateNoteCommand } from './note/CreateNoteCommand';
export { DeleteNotesCommand, DeleteNoteCommand } from './note/DeleteNotesCommand';
export { ResizeNotesCommand } from './note/ResizeNotesCommand';
export { MoveNotesCommand } from './note/MoveNotesCommand';
export { PasteNotesCommand } from './note/PasteNotesCommand';

// Project commands
export { ChangeProjectPropertyCommand, type ProjectUpdateProperties } from './project/ChangeProjectPropertyCommand';
export { ChangeLoopSettingsCommand, type LoopSettings } from './project/ChangeLoopSettingsCommand';