import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

/**
 * Command to move a region to a new position and/or track
 * Handles both position changes within the same track and moves between tracks
 */
export class MoveRegionCommand extends KGCommand {
  private regionId: string;
  private newStartTick: number;
  private newTrackId: string;
  private newTrackIndex: number;
  
  // Original state for undo
  private originalStartTick: number = 0;
  private originalTrackId: string = '';
  private originalTrackIndex: number = 0;
  private targetRegion: KGRegion | null = null;
  private originalTrack: KGTrack | null = null;
  private targetTrack: KGTrack | null = null;

  constructor(regionId: string, newStartTick: number, newTrackId: string, newTrackIndex: number) {
    super();
    this.regionId = regionId;
    this.newStartTick = newStartTick;
    this.newTrackId = newTrackId;
    this.newTrackIndex = newTrackIndex;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region to move
    let targetRegion: KGRegion | null = null;
    let originalTrack: KGTrack | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region) {
        targetRegion = region;
        originalTrack = track;
        break;
      }
    }

    if (!targetRegion || !originalTrack) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    // Find the target track
    const targetTrack = tracks.find(t => t.getId().toString() === this.newTrackId);
    if (!targetTrack) {
      throw new Error(`Target track with ID ${this.newTrackId} not found`);
    }

    this.targetRegion = targetRegion;
    this.originalTrack = originalTrack;
    this.targetTrack = targetTrack;

    // Store original values for undo
    this.originalStartTick = targetRegion.getStartTick();
    this.originalTrackId = targetRegion.getTrackId();
    this.originalTrackIndex = targetRegion.getTrackIndex();

    // Check if we're moving to a different track
    const isTrackChange = this.originalTrackId !== this.newTrackId;

    if (isTrackChange) {
      // Remove from original track
      const originalRegions = originalTrack.getRegions();
      originalTrack.setRegions(originalRegions.filter(r => r.getId() !== this.regionId));

      // Add to target track
      const targetRegions = targetTrack.getRegions();
      targetTrack.setRegions([...targetRegions, targetRegion]);

      console.log(`Moved region "${targetRegion.getName()}" from track ${this.originalTrackIndex} to track ${this.newTrackIndex}`);
    }

    // Update region properties
    targetRegion.setStartTick(this.newStartTick);
    targetRegion.setTrackId(this.newTrackId);
    targetRegion.setTrackIndex(this.newTrackIndex);

    const regionName = targetRegion.getName();
    console.log(`Moved region "${regionName}": position ${this.originalStartTick} → ${this.newStartTick}, track ${this.originalTrackIndex} → ${this.newTrackIndex}`);
  }

  undo(): void {
    if (!this.targetRegion || !this.originalTrack || !this.targetTrack) {
      throw new Error('Cannot undo: region or tracks not found');
    }

    // Check if we moved between tracks
    const wasTrackChange = this.originalTrackId !== this.newTrackId;

    if (wasTrackChange) {
      // Remove from current track
      const currentRegions = this.targetTrack.getRegions();
      this.targetTrack.setRegions(currentRegions.filter(r => r.getId() !== this.regionId));

      // Add back to original track
      const originalRegions = this.originalTrack.getRegions();
      this.originalTrack.setRegions([...originalRegions, this.targetRegion]);

      console.log(`Restored region "${this.targetRegion.getName()}" back to original track ${this.originalTrackIndex}`);
    }

    // Restore original region properties
    this.targetRegion.setStartTick(this.originalStartTick);
    this.targetRegion.setTrackId(this.originalTrackId);
    this.targetRegion.setTrackIndex(this.originalTrackIndex);

    const regionName = this.targetRegion.getName();
    console.log(`Restored region "${regionName}": position ${this.newStartTick} → ${this.originalStartTick}, track ${this.newTrackIndex} → ${this.originalTrackIndex}`);
  }

  getDescription(): string {
    const regionName = this.targetRegion ? this.targetRegion.getName() : `Region ${this.regionId}`;
    
    // Check if it's a track change or position change
    const isTrackChange = this.originalTrackId !== this.newTrackId;
    const isPositionChange = this.originalStartTick !== this.newStartTick;
    
    if (isTrackChange && isPositionChange) {
      return `Move region "${regionName}" to different track and position`;
    } else if (isTrackChange) {
      return `Move region "${regionName}" to different track`;
    } else if (isPositionChange) {
      return `Move region "${regionName}" to new position`;
    } else {
      return `Move region "${regionName}"`;
    }
  }

  /**
   * Get the ID of the region being moved
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the new start position
   */
  public getNewStartTick(): number {
    return this.newStartTick;
  }

  /**
   * Get the new track ID
   */
  public getNewTrackId(): string {
    return this.newTrackId;
  }

  /**
   * Get the new track index
   */
  public getNewTrackIndex(): number {
    return this.newTrackIndex;
  }

  /**
   * Get the original start position (only available after execute)
   */
  public getOriginalStartTick(): number {
    return this.originalStartTick;
  }

  /**
   * Get the original track ID (only available after execute)
   */
  public getOriginalTrackId(): string {
    return this.originalTrackId;
  }

  /**
   * Get the original track index (only available after execute)
   */
  public getOriginalTrackIndex(): number {
    return this.originalTrackIndex;
  }

  /**
   * Get the target region instance (only available after execute)
   */
  public getTargetRegion(): KGRegion | null {
    return this.targetRegion;
  }

  /**
   * Factory method to create a move command from bar-based coordinates
   */
  public static fromBarCoordinates(
    regionId: string,
    newBarNumber: number,
    newTrackId: string,
    newTrackIndex: number,
    timeSignature: { numerator: number; denominator: number }
  ): MoveRegionCommand {
    const ticksPerBar = timeSignature.numerator * 960 * (4 / timeSignature.denominator);
    const newStartTick = (newBarNumber - 1) * ticksPerBar;
    
    return new MoveRegionCommand(regionId, newStartTick, newTrackId, newTrackIndex);
  }

  /**
   * Factory method to create a position-only move command (same track)
   */
  public static createPositionOnlyMove(
    regionId: string, 
    newStartTick: number,
    currentTrackId: string, 
    currentTrackIndex: number
  ): MoveRegionCommand {
    return new MoveRegionCommand(regionId, newStartTick, currentTrackId, currentTrackIndex);
  }

  /**
   * Factory method to create a track-only move command (same position)
   */
  public static createTrackOnlyMove(
    regionId: string, 
    currentStartFromBeat: number, 
    newTrackId: string, 
    newTrackIndex: number
  ): MoveRegionCommand {
    return new MoveRegionCommand(regionId, currentStartFromBeat, newTrackId, newTrackIndex);
  }
}
