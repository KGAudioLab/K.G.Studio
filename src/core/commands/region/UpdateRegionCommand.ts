import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGTrack } from '../../track/KGTrack';

/**
 * Interface defining properties that can be updated on a region
 */
export interface RegionUpdateProperties {
  name?: string;
  // Future properties can be added here (e.g., color, instrument, etc.)
}

/**
 * Command to update region properties
 * Handles updating region name and other properties with undo support
 */
export class UpdateRegionCommand extends KGCommand {
  private regionId: string;
  private newProperties: RegionUpdateProperties;
  private originalProperties: RegionUpdateProperties = {};
  private targetRegion: KGRegion | null = null;
  private parentTrack: KGTrack | null = null;
  private changedProperties: Set<keyof RegionUpdateProperties> = new Set();

  constructor(regionId: string, properties: RegionUpdateProperties) {
    super();
    this.regionId = regionId;
    this.newProperties = properties;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region across all tracks
    let targetRegion: KGRegion | null = null;
    let parentTrack: KGTrack | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region) {
        targetRegion = region;
        parentTrack = track;
        break;
      }
    }

    if (!targetRegion || !parentTrack) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    this.targetRegion = targetRegion;
    this.parentTrack = parentTrack;

    // Store original properties for undo
    this.originalProperties = {
      name: this.targetRegion.getName(),
    };

    // Apply updates and track what actually changes
    const updatedProperties: string[] = [];

    // Update name
    if (this.newProperties.name !== undefined && this.newProperties.name !== this.originalProperties.name) {
      this.targetRegion.setName(this.newProperties.name);
      this.changedProperties.add('name');
      updatedProperties.push(`name: "${this.originalProperties.name}" → "${this.newProperties.name}"`);
    }

    if (updatedProperties.length > 0) {
      console.log(`Updated region ${this.regionId}: ${updatedProperties.join(', ')}`);
    } else {
      console.log(`No changes applied to region ${this.regionId}`);
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no region was updated');
    }

    // Only restore properties that were actually changed
    const restoredProperties: string[] = [];

    // Restore name (only if it was changed)
    if (this.changedProperties.has('name') && this.originalProperties.name !== undefined) {
      this.targetRegion.setName(this.originalProperties.name);
      restoredProperties.push(`name: "${this.originalProperties.name}"`);
    }

    console.log(`Restored region ${this.regionId}: ${restoredProperties.join(', ')}`);
  }

  getDescription(): string {
    const regionName = this.originalProperties.name || `Region ${this.regionId}`;
    const updatedProps: string[] = [];

    if (this.newProperties.name !== undefined) {
      updatedProps.push('name');
    }

    if (updatedProps.length === 1) {
      return `Update region "${regionName}" ${updatedProps[0]}`;
    } else if (updatedProps.length > 1) {
      return `Update region "${regionName}" properties`;
    }

    return `Update region "${regionName}"`;
  }

  /**
   * Get the ID of the region being updated
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the new properties being applied
   */
  public getNewProperties(): RegionUpdateProperties {
    return this.newProperties;
  }

  /**
   * Get the original properties (only available after execute)
   */
  public getOriginalProperties(): RegionUpdateProperties {
    return this.originalProperties;
  }

  /**
   * Get the target region instance (only available after execute)
   */
  public getTargetRegion(): KGRegion | null {
    return this.targetRegion;
  }

  /**
   * Get the parent track of the region (only available after execute)
   */
  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }

  /**
   * Get the properties that were actually changed (only available after execute)
   */
  public getChangedProperties(): Set<keyof RegionUpdateProperties> {
    return new Set(this.changedProperties);
  }
}