import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGTrack } from '../../track/KGTrack';
import { generateUniqueId } from '../../../util/miscUtil';
import { useProjectStore } from '../../../stores/projectStore';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { translate } from '../../../i18n/translate';

/**
 * Command to paste regions with their notes to a target track at a specific position
 * Handles creating new regions with new IDs and copying all notes with proper positioning
 */
export class PasteRegionsCommand extends KGCommand {
  private targetTrackId: string | null;
  private pastePosition: number;
  private sourceRegions: KGRegion[];
  private createdRegions: KGRegion[] = [];
  private targetTracks: KGTrack[] = [];
  private maxBarsBeforeExecution: number | null = null;
  private expandedMaxBars = false;

  constructor(targetTrackId: string | null, pastePosition: number, sourceRegions: KGRegion[]) {
    super();
    this.targetTrackId = targetTrackId;
    this.pastePosition = pastePosition;
    this.sourceRegions = [...sourceRegions]; // Create a copy to avoid reference issues
  }

  execute(): void {
    if (this.sourceRegions.length === 0) {
      throw new Error('No regions to paste');
    }

    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();
    this.maxBarsBeforeExecution = currentProject.getMaxBars();
    this.expandedMaxBars = false;

    const sourceTrackIds = new Set(this.sourceRegions.map(region => region.getTrackId()));
    const isMultiTrackPaste = sourceTrackIds.size > 1;
    const requiredTrackIds = isMultiTrackPaste
      ? sourceTrackIds
      : new Set(this.targetTrackId ? [this.targetTrackId] : []);

    if (!isMultiTrackPaste && !this.targetTrackId) {
      throw new Error(translate('regionPaste.error.selectTrack'));
    }

    const tracksById = new Map(tracks.map(track => [track.getId().toString(), track]));
    const missingTrackIds = [...requiredTrackIds].filter(trackId => !tracksById.has(trackId));
    if (missingTrackIds.length > 0) {
      if (isMultiTrackPaste) {
        throw new Error(translate('regionPaste.error.originalTracksMissing'));
      }
      throw new Error(translate('regionPaste.error.selectedTrackMissing'));
    }

    this.targetTracks = [...requiredTrackIds].map(trackId => tracksById.get(trackId)!);

    // Clear any previously created regions (for re-execution)
    this.createdRegions = [];

    // Calculate the base position from the first region to maintain relative positions
    const basePosition = this.sourceRegions[0].getStartFromBeat();

    const regionsToAdd: Array<{ targetTrack: KGTrack; region: KGRegion }> = [];

    // Build every pasted region before mutating any track.
    this.sourceRegions.forEach((originalRegion) => {
      const destinationTrackId = isMultiTrackPaste ? originalRegion.getTrackId() : this.targetTrackId!;
      const targetTrack = tracksById.get(destinationTrackId)!;
      // Generate new ID for the pasted region
      const newId = generateUniqueId('KGMidiRegion');
      
      // Calculate new position maintaining relative offset
      const relativeOffset = originalRegion.getStartFromBeat() - basePosition;
      const newPosition = this.pastePosition + relativeOffset;
      
      // Create a copy of the region with new position and ID
      let newRegion: KGRegion;
      
      if (originalRegion instanceof KGMidiRegion) {
        newRegion = new KGMidiRegion(
          newId,
          targetTrack.getId().toString(),
          targetTrack.getTrackIndex(),
          `${originalRegion.getName()} (Copy)`,
          newPosition,
          originalRegion.getLength()
        );
        newRegion.setColor(originalRegion.getColor());
        
        // Copy all notes from the original region
        const originalNotes = originalRegion.getNotes();
        originalNotes.forEach(note => {
          const copiedNote = new KGMidiNote(
            generateUniqueId('KGMidiNote'),
            note.getStartBeat(),
            note.getEndBeat(),
            note.getPitch(),
            note.getVelocity()
          );
          (newRegion as KGMidiRegion).addNote(copiedNote);
        });
        originalRegion.getPitchBends().forEach(pitchBend => {
          (newRegion as KGMidiRegion).addPitchBend(new KGMidiPitchBend(
            generateUniqueId('KGMidiPitchBend'),
            pitchBend.getBeat(),
            pitchBend.getValue()
          ));
        });
        originalRegion.getControllerEventsByType().forEach((events, controller) => {
          events.forEach(controllerEvent => {
            (newRegion as KGMidiRegion).addControllerEvent(controller, new KGMidiControllerEvent(
              generateUniqueId('KGMidiControllerEvent'),
              controllerEvent.getBeat(),
              controllerEvent.getValue()
            ));
          });
        });
        
        console.log(`Created MIDI region "${newRegion.getName()}" with ${originalNotes.length} notes`);
      } else if (originalRegion instanceof KGAudioRegion) {
        newRegion = new KGAudioRegion(
          generateUniqueId('KGAudioRegion'),
          targetTrack.getId().toString(),
          targetTrack.getTrackIndex(),
          `${originalRegion.getName()} (Copy)`,
          newPosition,
          originalRegion.getLength(),
          originalRegion.getAudioFileId(),
          originalRegion.getAudioFileName(),
          originalRegion.getAudioDurationSeconds(),
          originalRegion.getClipStartOffsetSeconds()
        );
        newRegion.setColor(originalRegion.getColor());

        console.log(`Created audio region "${newRegion.getName()}"`);
      } else {
        // Fallback for other region types
        newRegion = new KGRegion(
          newId,
          targetTrack.getId().toString(),
          targetTrack.getTrackIndex(),
          `${originalRegion.getName()} (Copy)`,
          newPosition,
          originalRegion.getLength()
        );
        newRegion.setColor(originalRegion.getColor());
        
        console.log(`Created region "${newRegion.getName()}"`);
      }
      
      regionsToAdd.push({ targetTrack, region: newRegion });
      this.createdRegions.push(newRegion);
    });

    this.targetTracks.forEach(targetTrack => {
      const additions = regionsToAdd
        .filter(item => item.targetTrack === targetTrack)
        .map(item => item.region);
      targetTrack.setRegions([...targetTrack.getRegions(), ...additions]);
    });

    const latestRegionEnd = this.createdRegions.reduce((maxEnd, region) => (
      Math.max(maxEnd, region.getStartFromBeat() + region.getLength())
    ), this.pastePosition);
    const requiredMaxBars = Math.ceil(latestRegionEnd / currentProject.getTimeSignature().numerator);
    if (requiredMaxBars > this.maxBarsBeforeExecution) {
      currentProject.setMaxBars(requiredMaxBars);
      this.expandedMaxBars = true;
    }

    const destinationDescription = isMultiTrackPaste
      ? `${this.targetTracks.length} original tracks`
      : `track ${this.targetTrackId}`;
    console.log(`Pasted ${this.sourceRegions.length} regions to ${destinationDescription} at position ${this.pastePosition}`);
  }

  undo(): void {
    if (this.targetTracks.length === 0 || this.createdRegions.length === 0) {
      throw new Error('Cannot undo: no regions were pasted');
    }

    // Check if piano roll is open for any of the regions we're about to remove
    const regionIdsToRemove = new Set(this.createdRegions.map(r => r.getId()));
    
    // Get current active region from the store
    const { activeRegionId, showPianoRoll, setShowPianoRoll, setActiveRegionId } = useProjectStore.getState();
    
    // Close piano roll if it's open for one of the regions we're removing
    if (showPianoRoll && activeRegionId && regionIdsToRemove.has(activeRegionId)) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      console.log(`Closed piano roll because active region ${activeRegionId} is being removed`);
    }

    this.targetTracks.forEach(targetTrack => {
      const filteredRegions = targetTrack.getRegions().filter(region => !regionIdsToRemove.has(region.getId()));
      targetTrack.setRegions(filteredRegions);
    });

    if (this.expandedMaxBars && this.maxBarsBeforeExecution !== null) {
      KGCore.instance().getCurrentProject().setMaxBars(this.maxBarsBeforeExecution);
    }

    console.log(`Removed ${this.createdRegions.length} pasted regions from ${this.targetTracks.length} track(s)`);
  }

  getDescription(): string {
    const regionCount = this.sourceRegions.length;
    if (new Set(this.sourceRegions.map(region => region.getTrackId())).size > 1) {
      return translate('regionPaste.description.originalTracks', { count: regionCount });
    }

    const targetTrack = this.targetTracks[0];
    const trackName = targetTrack ? targetTrack.getName() : `Track ${this.targetTrackId}`;
    
    if (regionCount === 1) {
      const regionName = this.sourceRegions[0].getName();
      return `Paste region "${regionName}" to "${trackName}"`;
    } else {
      return `Paste ${regionCount} regions to "${trackName}"`;
    }
  }

  /**
   * Get the target track ID
   */
  public getTargetTrackId(): string | null {
    return this.targetTrackId;
  }

  /**
   * Get the paste position
   */
  public getPastePosition(): number {
    return this.pastePosition;
  }

  /**
   * Get the source regions being pasted
   */
  public getSourceRegions(): KGRegion[] {
    return [...this.sourceRegions];
  }

  /**
   * Get the created regions (only available after execute)
   */
  public getCreatedRegions(): KGRegion[] {
    return [...this.createdRegions];
  }

  /**
   * Get the target track instance (only available after execute)
   */
  public getTargetTrack(): KGTrack | null {
    return this.targetTracks.length === 1 ? this.targetTracks[0] : null;
  }

  public getTargetTracks(): KGTrack[] {
    return [...this.targetTracks];
  }

  /**
   * Factory method to create a paste command from the clipboard
   */
  public static fromClipboard(targetTrackId: string | null, pastePosition: number): PasteRegionsCommand | null {
    const core = KGCore.instance();
    const copiedItems = core.getCopiedItems();
    const regionsToCreate = copiedItems.filter(item => item instanceof KGRegion) as KGRegion[];
    
    if (regionsToCreate.length === 0) {
      return null;
    }
    
    return new PasteRegionsCommand(targetTrackId, pastePosition, regionsToCreate);
  }

  /**
   * Factory method to create a paste command from specific regions
   */
  public static fromRegions(targetTrackId: string | null, pastePosition: number, regions: KGRegion[]): PasteRegionsCommand {
    return new PasteRegionsCommand(targetTrackId, pastePosition, regions);
  }
}
