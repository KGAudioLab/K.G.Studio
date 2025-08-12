/**
 * UI Constants for KGSP
 * Contains values used across the UI components
 */

// Debug constants
export const DEBUG_MODE = {
  CORE: true,
  TOOLBAR: true,
  MAIN_CONTENT: true,
  TRACK_INFO: true,
  TRACK_GRID_PANEL: true,
  TRACK_GRID_ITEM: true,
  REGION_ITEM: true,
  PIANO_ROLL: true,
  MIDI_IMPORT: true,
};

// Toolbar related constants
export const TOOLBAR_CONSTANTS = {
};

// Region related constants
export const REGION_CONSTANTS = {
  // Edge detection threshold for region resizing (in pixels)
  EDGE_THRESHOLD: 10,
  // Minimum region length in bars
  MIN_REGION_LENGTH: 1.0,
};

// Piano roll related constants
export const PIANO_ROLL_CONSTANTS = {
  // Default height of the piano roll in pixels
  PIANO_ROLL_HEIGHT: 500,

  // offsets
  PIANO_KEY_CLICK_Y_OFFSET: -2,

  // notes
  NOTE_EDGE_OFFSET: 5,
  
  // Minimum note length in beats (1/64 beat)
  MIN_NOTE_LENGTH: 1/64,

  // Dragging threshold for note selection
  DRAG_THRESHOLD: 5,
};

// Playing/playback related constants
export const PLAYING_CONSTANTS = {
  // Update rate for playback (10 FPS for performance evaluation)
  UPDATE_INTERVAL_MS: 100, // 1000ms / 10fps = 100ms
};
