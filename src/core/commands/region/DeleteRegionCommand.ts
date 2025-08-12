import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGTrack } from '../../track/KGTrack';
import { useProjectStore } from '../../../stores/projectStore';

/**
 * Command to delete a region from a track
 * Handles both the core model update and provides undo functionality
 */
export class DeleteRegionCommand extends KGCommand {
  private regionId: string;
  private trackId: string | null = null;
  private deletedRegion: KGRegion | null = null;
  private originalRegionIndex: number = -1;

  constructor(regionId: string) {
    super();
    this.regionId = regionId;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the track that contains this region
    let targetTrack: KGTrack | null = null;
    let regionToDelete: KGRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const regionIndex = regions.findIndex(region => region.getId() === this.regionId);
      
      if (regionIndex !== -1) {
        targetTrack = track;
        regionToDelete = regions[regionIndex];
        this.originalRegionIndex = regionIndex;
        break;
      }
    }

    if (!targetTrack || !regionToDelete) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    // Store data for undo
    this.trackId = targetTrack.getId().toString();
    this.deletedRegion = regionToDelete;

    // Remove the region from the track
    targetTrack.removeRegion(this.regionId);

    // Clear selection if this region was selected
    const selectedItems = core.getSelectedItems();
    const selectedRegion = selectedItems.find(item => 
      item instanceof KGRegion && item.getId() === this.regionId
    );
    if (selectedRegion) {
      core.removeSelectedItem(selectedRegion);
    }

    // Close piano roll if it's open for this region
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    if (showPianoRoll && activeRegionId === this.regionId) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${this.regionId} is being deleted`);
    }

    const regionName = regionToDelete.getName();
    console.log(`Deleted region "${regionName}" from track ${this.trackId}`);
  }

  undo(): void {
    if (!this.deletedRegion || !this.trackId) {
      throw new Error('Cannot undo: no region data stored');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the target track
    const targetTrack = tracks.find(track => track.getId().toString() === this.trackId);
    if (!targetTrack) {
      throw new Error(`Track with ID ${this.trackId} not found during undo`);
    }

    // Restore the region to its original position
    const regions = targetTrack.getRegions();
    if (this.originalRegionIndex >= 0 && this.originalRegionIndex <= regions.length) {
      // Insert at the original position
      regions.splice(this.originalRegionIndex, 0, this.deletedRegion);
      targetTrack.setRegions(regions);
    } else {
      // Fallback: add to the end
      targetTrack.addRegion(this.deletedRegion);
    }

    const regionName = this.deletedRegion.getName();
    console.log(`Restored region "${regionName}" to track ${this.trackId}`);
  }

  getDescription(): string {
    const regionName = this.deletedRegion ? this.deletedRegion.getName() : `Region ${this.regionId}`;
    return `Delete region "${regionName}"`;
  }

  /**
   * Get the ID of the region that was/will be deleted
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the deleted region instance (only available after execute)
   */
  public getDeletedRegion(): KGRegion | null {
    return this.deletedRegion;
  }
}

/**
 * Command to delete multiple regions at once
 * More efficient than individual delete commands for bulk operations
 */
export class DeleteMultipleRegionsCommand extends KGCommand {
  private regionIds: string[];
  private deletedRegionData: Array<{
    region: KGRegion;
    trackId: string;
    originalIndex: number;
  }> = [];

  constructor(regionIds: string[]) {
    super();
    this.regionIds = regionIds;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Clear any existing deleted region data to prevent duplicates on re-execution
    this.deletedRegionData = [];

    // Find and store all regions to delete
    for (const regionId of this.regionIds) {
      for (const track of tracks) {
        const regions = track.getRegions();
        const regionIndex = regions.findIndex(region => region.getId() === regionId);
        
        if (regionIndex !== -1) {
          const regionToDelete = regions[regionIndex];
          
          // Store for undo
          this.deletedRegionData.push({
            region: regionToDelete,
            trackId: track.getId().toString(),
            originalIndex: regionIndex
          });
          
          break;
        }
      }
    }

    if (this.deletedRegionData.length === 0) {
      throw new Error('No regions found to delete');
    }

    // Sort by original index in descending order to maintain correct indices during deletion
    this.deletedRegionData.sort((a, b) => b.originalIndex - a.originalIndex);

    // Check if piano roll should be closed before deleting regions
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    const regionIdsToDelete = new Set(this.deletedRegionData.map(data => data.region.getId()));
    
    if (showPianoRoll && activeRegionId && regionIdsToDelete.has(activeRegionId)) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${activeRegionId} is being deleted`);
    }

    // Delete all regions
    for (const data of this.deletedRegionData) {
      const targetTrack = tracks.find(track => track.getId().toString() === data.trackId);
      if (targetTrack) {
        targetTrack.removeRegion(data.region.getId());
        
        // Clear selection if this region was selected
        const selectedItems = core.getSelectedItems();
        const selectedRegion = selectedItems.find(item => 
          item instanceof KGRegion && item.getId() === data.region.getId()
        );
        if (selectedRegion) {
          core.removeSelectedItem(selectedRegion);
        }
      }
    }

    console.log(`Deleted ${this.deletedRegionData.length} regions`);
  }

  undo(): void {
    if (this.deletedRegionData.length === 0) {
      throw new Error('Cannot undo: no region data stored');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Restore all regions in reverse order (original index ascending)
    const sortedData = [...this.deletedRegionData].sort((a, b) => a.originalIndex - b.originalIndex);

    for (const data of sortedData) {
      const targetTrack = tracks.find(track => track.getId().toString() === data.trackId);
      if (targetTrack) {
        const regions = targetTrack.getRegions();
        if (data.originalIndex >= 0 && data.originalIndex <= regions.length) {
          regions.splice(data.originalIndex, 0, data.region);
          targetTrack.setRegions(regions);
        } else {
          targetTrack.addRegion(data.region);
        }
      }
    }

    console.log(`Restored ${this.deletedRegionData.length} regions`);
  }

  getDescription(): string {
    if (this.deletedRegionData.length === 1) {
      const regionName = this.deletedRegionData[0].region.getName();
      return `Delete region "${regionName}"`;
    }
    return `Delete ${this.regionIds.length} regions`;
  }

  /**
   * Get the IDs of regions that were/will be deleted
   */
  public getRegionIds(): string[] {
    return this.regionIds;
  }

  /**
   * Get the deleted region data (only available after execute)
   */
  public getDeletedRegionData(): Array<{region: KGRegion; trackId: string; originalIndex: number}> {
    return this.deletedRegionData;
  }
}