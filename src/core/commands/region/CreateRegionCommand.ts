import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { generateUniqueId } from '../../../util/miscUtil';
import { useProjectStore } from '../../../stores/projectStore';

/**
 * Command to create a new region in a track
 * Handles both the core model update and provides undo functionality
 */
export class CreateRegionCommand extends KGCommand {
  private trackId: string;
  private trackIndex: number;
  private regionName: string;
  private startBeat: number;
  private lengthInBeats: number;
  private regionId: string;
  private createdRegion: KGMidiRegion | null = null;

  constructor(
    trackId: string,
    trackIndex: number,
    startBeat: number,
    lengthInBeats: number,
    regionName?: string,
    regionId?: string
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startBeat = startBeat;
    this.lengthInBeats = lengthInBeats;
    this.regionId = regionId || generateUniqueId('KGMidiRegion');
    
    // Generate region name if not provided
    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();
    const track = tracks.find(t => t.getId().toString() === trackId);
    this.regionName = regionName || (track ? `${track.getName()} Region` : 'Region');
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Find the target track
    const targetTrack = tracks.find(track => track.getId().toString() === this.trackId);
    if (!targetTrack) {
      throw new Error(`Track with ID ${this.trackId} not found`);
    }

    // Create the new MIDI region
    this.createdRegion = new KGMidiRegion(
      this.regionId,
      this.trackId,
      this.trackIndex,
      this.regionName,
      this.startBeat,
      this.lengthInBeats
    );

    // Add the region to the track
    targetTrack.addRegion(this.createdRegion);

    console.log(`Created region "${this.regionName}" in track ${this.trackId} at beat ${this.startBeat}`);
  }

  undo(): void {
    if (!this.createdRegion) {
      throw new Error('Cannot undo: no region was created');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    
    // Find the target track
    const targetTrack = tracks.find(track => track.getId().toString() === this.trackId);
    if (!targetTrack) {
      throw new Error(`Track with ID ${this.trackId} not found during undo`);
    }

    // Close piano roll if it's open for this region
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    if (showPianoRoll && activeRegionId === this.regionId) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${this.regionId} is being removed`);
    }

    // Remove the region from the track
    targetTrack.removeRegion(this.regionId);

    console.log(`Removed region "${this.regionName}" from track ${this.trackId}`);
  }

  getDescription(): string {
    return `Create region "${this.regionName}"`;
  }

  /**
   * Get the ID of the region that was/will be created
   */
  public getRegionId(): string {
    return this.regionId;
  }

  /**
   * Get the created region instance (only available after execute)
   */
  public getCreatedRegion(): KGMidiRegion | null {
    return this.createdRegion;
  }

  /**
   * Create a region command from bar-based coordinates (common UI pattern)
   */
  public static fromBarCoordinates(
    trackId: string,
    trackIndex: number,
    barNumber: number,
    lengthInBars: number,
    beatsPerBar: number,
    regionName?: string,
    regionId?: string
  ): CreateRegionCommand {
    const startBeat = (barNumber - 1) * beatsPerBar;
    const lengthInBeats = lengthInBars * beatsPerBar;
    
    return new CreateRegionCommand(
      trackId,
      trackIndex,
      startBeat,
      lengthInBeats,
      regionName,
      regionId
    );
  }
}