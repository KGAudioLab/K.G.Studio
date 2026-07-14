import { KGCore } from '../core/KGCore';
import { KGRegion } from '../core/region/KGRegion';
import { useProjectStore } from '../stores/projectStore';
import { showAlert } from './dialogUtil';

export interface PasteOperationResult {
  success: boolean;
  failureMessageShown?: boolean;
}

/**
 * Utility functions for copy/paste operations
 * Extracted from useGlobalKeyboardHandler for reuse in toolbar buttons
 */

/**
 * Handles copy operation for currently selected items
 * @returns {boolean} true if items were copied, false if no items were selected
 */
export const handleCopyOperation = (): boolean => {
  const core = KGCore.instance();
  const selectedItems = core.getSelectedItems();
  
  if (selectedItems.length > 0) {
    core.copySelectedItems();
    console.log(`Copied ${selectedItems.length} items to clipboard`);
    return true;
  }
  
  console.log('No items selected to copy');
  return false;
};

/**
 * Handles paste operation based on current context
 * Returns whether anything was pasted and whether a specific failure message was shown.
 */
export const handlePasteOperation = (): PasteOperationResult => {
  const core = KGCore.instance();
  const copiedItems = core.getCopiedItems();
  
  if (copiedItems.length === 0) {
    console.log('No items in clipboard to paste');
    return { success: false };
  }

  // Get current store state
  const { 
    selectedTrackId, 
    showPianoRoll, 
    activeRegionId,
    pasteRegionsAtTrack,
    pasteNotesToActiveRegion 
  } = useProjectStore.getState();

  // Determine paste context and handle accordingly
  const hasRegions = copiedItems.some(item => item.getRootType() === 'KGRegion');
  const hasNotes = copiedItems.some(item => item.getRootType() === 'KGMidiNote');

  if (hasRegions && !hasNotes) {
    const copiedRegions = copiedItems.filter(item => item instanceof KGRegion) as KGRegion[];
    const isMultiTrackPaste = new Set(copiedRegions.map(region => region.getTrackId())).size > 1;

    if (selectedTrackId || isMultiTrackPaste) {
      const playheadPosition = core.getPlayheadPosition();
      const result = pasteRegionsAtTrack(selectedTrackId, playheadPosition);
      if (!result.success) {
        if (result.error) {
          void showAlert(result.error);
          return { success: false, failureMessageShown: true };
        }
        return { success: false };
      }
      console.log(`Pasted ${copiedItems.length} regions at position ${playheadPosition}`);
      return { success: true };
    } else {
      console.log('No track selected for pasting regions');
      return { success: false };
    }
  } else if (hasNotes && !hasRegions) {
    // Pasting notes - only when piano roll is open
    if (showPianoRoll && activeRegionId) {
      // Use the active region's playhead position (could be different from global playhead)
      // For now, we'll use global playhead - this can be refined later
      const playheadPosition = core.getPlayheadPosition();
      pasteNotesToActiveRegion(activeRegionId, playheadPosition);
      console.log(`Pasted ${copiedItems.length} notes to active region ${activeRegionId}, position ${playheadPosition}`);
      return { success: true };
    } else {
      console.log('Piano roll must be open to paste notes');
      return { success: false };
    }
  } else if (hasRegions && hasNotes) {
    console.log('Mixed clipboard content (regions + notes) cannot be pasted');
    return { success: false };
  }

  return { success: false };
};
