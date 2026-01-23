import { useEffect } from 'react';
import { matchesKeyboardShortcut } from '../util/osUtil';
import { handleCopyOperation, handlePasteOperation } from '../util/copyPasteUtil';
import { saveProject } from '../util/saveUtil';
import { ConfigManager } from '../core/config/ConfigManager';
import { useProjectStore } from '../stores/projectStore';
import { selectAllNotesInActiveRegion } from '../util/selectionUtil';

/**
 * Global keyboard handler for copy/paste, undo/redo, play/pause, and save operations
 * Handles keyboard shortcuts defined in the configuration
 */
export const useGlobalKeyboardHandler = () => {
  const { undo, redo, setStatus, isPlaying, startPlaying, stopPlaying, toggleLoop, projectName } = useProjectStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = event.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

      // Enhanced prevention for system shortcuts like Cmd+S/Ctrl+S
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      const isSKey = event.key.toLowerCase() === 's';
      
      if (isCtrlOrCmd && isSKey) {
        // Use multiple prevention methods for better browser compatibility
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Early return to handle save immediately
        try {
          saveProject(projectName, setStatus);
        } catch (error) {
          console.error('Save failed:', error);
          setStatus('Save failed');
        }
        return false;
      }

      // Get keyboard shortcuts from config
      const configManager = ConfigManager.instance();
      if (!configManager.getIsInitialized()) {
        return;
      }

      const undoShortcut = configManager.get('hotkeys.main.undo') as string;
      const redoShortcut = configManager.get('hotkeys.main.redo') as string;
      const copyShortcut = configManager.get('hotkeys.main.copy') as string;
      const pasteShortcut = configManager.get('hotkeys.main.paste') as string;
      const selectAllShortcut = configManager.get('hotkeys.main.select_all') as string;
      const playShortcut = configManager.get('hotkeys.main.play') as string;
      const loopShortcut = configManager.get('hotkeys.main.loop') as string;
      const saveShortcut = configManager.get('hotkeys.main.save') as string;

      // Check for undo shortcut
      if (undoShortcut && matchesKeyboardShortcut(event, undoShortcut)) {
        event.preventDefault();
        try {
          undo();
          setStatus('Undo performed');
        } catch (error) {
          console.error('Undo failed:', error);
          setStatus('Undo failed');
        }
        return;
      }

      // Check for redo shortcut
      if (redoShortcut && matchesKeyboardShortcut(event, redoShortcut)) {
        event.preventDefault();
        try {
          redo();
          setStatus('Redo performed');
        } catch (error) {
          console.error('Redo failed:', error);
          setStatus('Redo failed');
        }
        return;
      }

      // Check for copy shortcut
      if (copyShortcut && matchesKeyboardShortcut(event, copyShortcut)) {
        event.preventDefault();
        const copied = handleCopyOperation();
        if (copied) {
          setStatus('Items copied to clipboard');
        } else {
          setStatus('No items selected to copy');
        }
        return;
      }

      // Check for paste shortcut
      if (pasteShortcut && matchesKeyboardShortcut(event, pasteShortcut)) {
        event.preventDefault();
        const pasted = handlePasteOperation();
        if (pasted) {
          setStatus('Items pasted from clipboard');
        } else {
          setStatus('Cannot paste - no valid clipboard content or context');
        }
        return;
      }

      // Check for select-all-notes shortcut (only when piano roll is open)
      if (selectAllShortcut && matchesKeyboardShortcut(event, selectAllShortcut)) {
        event.preventDefault();
        selectAllNotesInActiveRegion();
        return;
      }

      // Check for play/pause shortcut
      if (playShortcut && matchesKeyboardShortcut(event, playShortcut)) {
        event.preventDefault();
        try {
          if (!isPlaying) {
            startPlaying();
            setStatus('Playback started');
          } else {
            stopPlaying();
            setStatus('Playback stopped');
          }
        } catch (error) {
          console.error('Play/pause failed:', error);
          setStatus('Play/pause failed');
        }
        return;
      }

      // Check for loop toggle shortcut
      if (loopShortcut && matchesKeyboardShortcut(event, loopShortcut)) {
        event.preventDefault();
        try {
          toggleLoop();
          setStatus('Loop toggled');
        } catch (error) {
          console.error('Loop toggle failed:', error);
          setStatus('Loop toggle failed');
        }
        return;
      }

      // Check for save shortcut
      if (saveShortcut && matchesKeyboardShortcut(event, saveShortcut)) {
        event.preventDefault();
        try {
          saveProject(projectName, setStatus);
        } catch (error) {
          console.error('Save failed:', error);
          setStatus('Save failed');
        }
        return;
      }
    };

    // Add global event listener with capture for earlier interception
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    // Cleanup on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [undo, redo, setStatus, isPlaying, startPlaying, stopPlaying, toggleLoop, projectName]); // Include dependencies for store actions
};