import { useCallback } from 'react';
import { DEBUG_MODE } from '../constants';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGTrack } from '../core/track/KGTrack';
import { KGCore } from '../core/KGCore';
import type { RegionUI } from '../components/interfaces';
import { DeleteMultipleRegionsCommand } from '../core/commands';

interface UseRegionOperationsProps {
  tracks: KGTrack[];
  updateTrack: (track: KGTrack) => void;
  setRegions: React.Dispatch<React.SetStateAction<RegionUI[]>>;
  selectedRegionId: string | null;
  setSelectedRegionId: React.Dispatch<React.SetStateAction<string | null>>;
  showPianoRoll: boolean;
  setShowPianoRoll: (show: boolean) => void;
  activeRegionId: string | null;
  setActiveRegionId: (regionId: string | null) => void;
}

export const useRegionOperations = ({
  tracks,
  updateTrack,
  setRegions,
  selectedRegionId,
  setSelectedRegionId,
  showPianoRoll,
  setShowPianoRoll,
  activeRegionId,
  setActiveRegionId
}: UseRegionOperationsProps) => {
  // Get KGCore instance for accessing selected items
  const core = KGCore.instance();

  /**
   * Utility function to delete selected regions using commands
   * This function:
   * 1. Gets all selected regions from KGCore
   * 2. Creates a DeleteMultipleRegionsCommand with the region IDs
   * 3. Executes the command (which handles the model updates)
   * 4. Updates the UI state to reflect the deletion
   * 5. Updates tracks in the store and manages UI state
   * 
   * @returns {boolean} True if regions were deleted, false if no regions were selected
   */
  const deleteSelectedRegions = useCallback(() => {
    // Get all selected regions from KGCore
    const selectedItems = core.getSelectedItems();
    const selectedRegions = selectedItems.filter(item => 
      item instanceof KGMidiRegion
    ) as KGMidiRegion[];
    
    if (selectedRegions.length === 0) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log('No regions selected for deletion');
      }
      return false;
    }
    
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Deleting ${selectedRegions.length} selected regions`);
    }
    
    // Get the region IDs for the command
    const regionIds = selectedRegions.map(region => region.getId());
    
    // Create and execute the delete command
    const command = new DeleteMultipleRegionsCommand(regionIds);
    core.executeCommand(command);
    
    // Update tracks in the store to reflect the changes
    const deletedRegionData = command.getDeletedRegionData();
    const uniqueTrackIds = new Set(deletedRegionData.map(data => data.trackId));
    
    uniqueTrackIds.forEach(trackId => {
      const track = tracks.find(t => t.getId().toString() === trackId);
      if (track) {
        updateTrack(track);
      }
    });
    
    // Update regions state to reflect the deletion
    setRegions(prevRegions => {
      const selectedRegionIds = new Set(regionIds);
      const filteredRegions = prevRegions.filter(region => !selectedRegionIds.has(region.id));
      
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Updated regions state: ${prevRegions.length} -> ${filteredRegions.length} regions`);
      }
      
      return filteredRegions;
    });
    
    // Clear selected region ID if it was deleted
    if (selectedRegionId && regionIds.includes(selectedRegionId)) {
      setSelectedRegionId(null);
    }
    
    // Close piano roll if the active region was deleted
    if (activeRegionId && regionIds.includes(activeRegionId)) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
    }
    
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Deleted ${selectedRegions.length} regions using command`);
    }
    
    return true;
  }, [tracks, selectedRegionId, activeRegionId, updateTrack, setRegions, setSelectedRegionId, setShowPianoRoll, setActiveRegionId, core]);

  return {
    deleteSelectedRegions
  };
}; 