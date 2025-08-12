import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';

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
 * @returns {boolean} true if items were pasted, false if paste was not possible
 */
export const handlePasteOperation = (): boolean => {
  const core = KGCore.instance();
  const copiedItems = core.getCopiedItems();
  
  if (copiedItems.length === 0) {
    console.log('No items in clipboard to paste');
    return false;
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
    // Pasting regions - need selected track and playhead position
    if (selectedTrackId) {
      const playheadPosition = core.getPlayheadPosition();
      pasteRegionsAtTrack(selectedTrackId, playheadPosition);
      console.log(`Pasted ${copiedItems.length} regions at track ${selectedTrackId}, position ${playheadPosition}`);
      return true;
    } else {
      console.log('No track selected for pasting regions');
      return false;
    }
  } else if (hasNotes && !hasRegions) {
    // Pasting notes - only when piano roll is open
    if (showPianoRoll && activeRegionId) {
      // Use the active region's playhead position (could be different from global playhead)
      // For now, we'll use global playhead - this can be refined later
      const playheadPosition = core.getPlayheadPosition();
      pasteNotesToActiveRegion(activeRegionId, playheadPosition);
      console.log(`Pasted ${copiedItems.length} notes to active region ${activeRegionId}, position ${playheadPosition}`);
      return true;
    } else {
      console.log('Piano roll must be open to paste notes');
      return false;
    }
  } else if (hasRegions && hasNotes) {
    console.log('Mixed clipboard content (regions + notes) cannot be pasted');
    return false;
  }

  return false;
};