/**
 * OS utility functions for platform detection and keyboard shortcuts
 */
import React from 'react';

/**
 * Detects the current operating system platform
 * @returns The platform name
 */
export const getPlatform = (): 'mac' | 'windows' | 'linux' | 'unknown' => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac';
  } else if (platform.includes('win') || userAgent.includes('win')) {
    return 'windows';
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }
  
  return 'unknown';
};

/**
 * Checks if the appropriate modifier key is pressed based on the current platform
 * On Mac: checks for metaKey (CMD)
 * On Windows/Linux: checks for ctrlKey (CTRL)
 * @param event - The keyboard or mouse event (both native and React events)
 * @returns true if the platform-appropriate modifier key is pressed
 */
export const isModifierKeyPressed = (event: KeyboardEvent | MouseEvent | React.KeyboardEvent | React.MouseEvent): boolean => {
  const platform = getPlatform();
  
  if (platform === 'mac') {
    return event.metaKey;
  } else {
    // Windows, Linux, or unknown - use Ctrl key
    return event.ctrlKey;
  }
};

/**
 * Gets the display name of the modifier key for the current platform
 * @returns The display name (e.g., "Cmd" for Mac, "Ctrl" for others)
 */
export const getModifierKeyDisplayName = (): string => {
  const platform = getPlatform();
  return platform === 'mac' ? 'Cmd' : 'Ctrl';
};

/**
 * Resolves a keyboard shortcut string by replacing 'ctrl' with the appropriate modifier for the current platform
 * @param shortcut - The shortcut string (e.g., "ctrl+z", "ctrl+shift+z")
 * @returns The resolved shortcut with platform-specific modifiers
 */
export const resolveKeyboardShortcut = (shortcut: string): string => {
  const platform = getPlatform();
  if (platform === 'mac') {
    // Replace 'ctrl' with 'cmd' on Mac
    return shortcut.replace(/\bctrl\b/gi, 'cmd');
  }
  return shortcut;
};

/**
 * Checks if a keyboard event matches a given shortcut string
 * @param event - The keyboard event
 * @param shortcut - The shortcut string (e.g., "ctrl+z", "ctrl+shift+z")
 * @returns true if the event matches the shortcut
 */
export const matchesKeyboardShortcut = (event: KeyboardEvent | React.KeyboardEvent, shortcut: string): boolean => {
  const normalizedShortcut = shortcut.toLowerCase();
  const keys = normalizedShortcut.split('+');
  
  // Extract the main key (last part)
  const mainKey = keys[keys.length - 1];
  
  // Handle special key mappings
  let eventKey = event.key.toLowerCase();
  if (eventKey === ' ') {
    eventKey = 'space';
  }
  
  if (eventKey !== mainKey) {
    return false;
  }
  
  // Check modifiers
  const hasCtrl = keys.includes('ctrl');
  const hasShift = keys.includes('shift');
  const hasAlt = keys.includes('alt');
  const hasCmd = keys.includes('cmd');
  
  const platform = getPlatform();
  
  // Handle platform-specific modifier checking
  let expectedCtrlOrCmd = false;
  if (platform === 'mac') {
    expectedCtrlOrCmd = hasCmd || hasCtrl; // On Mac, both 'ctrl' and 'cmd' should map to metaKey
  } else {
    expectedCtrlOrCmd = hasCtrl; // On other platforms, only 'ctrl' maps to ctrlKey
  }
  
  const actualCtrlOrCmd = platform === 'mac' ? event.metaKey : event.ctrlKey;
  
  return actualCtrlOrCmd === expectedCtrlOrCmd &&
         event.shiftKey === hasShift &&
         event.altKey === hasAlt;
};