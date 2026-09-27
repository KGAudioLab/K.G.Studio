import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGRegion } from '../../region/KGRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';

/**
 * Command to resize a region (change start position and/or length)
 * Handles both the core model update and note adjustments for start position changes
 */
export class ResizeRegionCommand extends KGCommand {
  private regionId: string;
  private newStartTick: number;
  private newLength: number;
  private originalStartTick: number = 0;
  private originalLength: number = 0;
  private targetRegion: KGRegion | null = null;

  // Store note adjustments for undo
  private noteAdjustments: Array<{
    noteId: string;
    originalStartTick: number;
    originalEndTick: number;
  }> = [];
  private pitchBendAdjustments: Array<{
    pitchBendId: string;
    originalTick: number;
  }> = [];
  private controllerEventAdjustments: Array<{
    controller: number;
    controllerEventId: string;
    originalTick: number;
  }> = [];

  // Audio region clip offset support
  private newClipStartOffsetSeconds?: number;
  private originalClipStartOffsetSeconds: number = 0;

  constructor(regionId: string, newStartTick: number, newLength: number, newClipStartOffsetSeconds?: number) {
    super();
    this.regionId = regionId;
    this.newStartTick = newStartTick;
    this.newLength = newLength;
    this.newClipStartOffsetSeconds = newClipStartOffsetSeconds;
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const tracks = currentProject.getTracks();

    // Find the region to resize
    let targetRegion: KGRegion | null = null;

    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === this.regionId);
      if (region) {
        targetRegion = region;
        break;
      }
    }

    if (!targetRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    this.targetRegion = targetRegion;

    // Store original values for undo
    this.originalStartTick = targetRegion.getStartTick();
    this.originalLength = targetRegion.getLengthTicks();

    // Handle note adjustments if start position changes (left-edge resize) for MIDI regions
    if (this.newStartTick !== this.originalStartTick && targetRegion instanceof KGMidiRegion) {
      const tickOffset = this.newStartTick - this.originalStartTick;

      // Store original note positions and adjust notes to maintain absolute positions
      const notes = targetRegion.getNotes();
      notes.forEach(note => {
        // Store original positions for undo
        this.noteAdjustments.push({
          noteId: note.getId(),
          originalStartTick: note.getStartTick(),
          originalEndTick: note.getEndTick()
        });

        // Adjust note positions to maintain absolute position
        note.setStartTick(note.getStartTick() - tickOffset);
        note.setEndTick(note.getEndTick() - tickOffset);
      });
      targetRegion.getPitchBends().forEach((pitchBend: KGMidiPitchBend) => {
        this.pitchBendAdjustments.push({
          pitchBendId: pitchBend.getId(),
          originalTick: pitchBend.getTick(),
        });
        pitchBend.setTick(pitchBend.getTick() - tickOffset);
      });
      targetRegion.getControllerEventsByType().forEach((events, controller) => {
        events.forEach((controllerEvent: KGMidiControllerEvent) => {
          this.controllerEventAdjustments.push({
            controller,
            controllerEventId: controllerEvent.getId(),
            originalTick: controllerEvent.getTick(),
          });
          controllerEvent.setTick(controllerEvent.getTick() - tickOffset);
        });
      });

      console.log(`Adjusted ${notes.length} notes by offset ${-tickOffset} beats to maintain absolute positions`);
    }

    // Handle clip offset for audio regions
    if (targetRegion instanceof KGAudioRegion) {
      this.originalClipStartOffsetSeconds = targetRegion.getClipStartOffsetSeconds();
      if (this.newClipStartOffsetSeconds !== undefined) {
        targetRegion.setClipStartOffsetSeconds(this.newClipStartOffsetSeconds);
        console.log(`Updated audio clip offset: ${this.originalClipStartOffsetSeconds} → ${this.newClipStartOffsetSeconds}`);
      }
    }

    // Apply the resize
    targetRegion.setStartTick(this.newStartTick);
    targetRegion.setLengthTicks(this.newLength);

    const regionName = targetRegion.getName();
    console.log(`Resized region "${regionName}": start ${this.originalStartTick} → ${this.newStartTick}, length ${this.originalLength} → ${this.newLength}`);
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: no region was resized');
    }

    // Restore note positions if they were adjusted
    if (this.noteAdjustments.length > 0 && this.targetRegion instanceof KGMidiRegion) {
      const notes = this.targetRegion.getNotes();

      // Restore each note to its original position
      this.noteAdjustments.forEach(adjustment => {
        const note = notes.find(n => n.getId() === adjustment.noteId);
        if (note) {
          note.setStartTick(adjustment.originalStartTick);
          note.setEndTick(adjustment.originalEndTick);
        }
      });

      console.log(`Restored ${this.noteAdjustments.length} notes to their original positions`);
    }
    if (this.pitchBendAdjustments.length > 0 && this.targetRegion instanceof KGMidiRegion) {
      const pitchBends = this.targetRegion.getPitchBends();
      this.pitchBendAdjustments.forEach(adjustment => {
        const pitchBend = pitchBends.find(candidate => candidate.getId() === adjustment.pitchBendId);
        if (pitchBend) {
          pitchBend.setTick(adjustment.originalTick);
        }
      });
    }
    if (this.controllerEventAdjustments.length > 0 && this.targetRegion instanceof KGMidiRegion) {
      const midiRegion = this.targetRegion;
      this.controllerEventAdjustments.forEach(adjustment => {
        const controllerEvent = midiRegion.getControllerEvents(adjustment.controller)
          .find(candidate => candidate.getId() === adjustment.controllerEventId);
        if (controllerEvent) {
          controllerEvent.setTick(adjustment.originalTick);
        }
      });
    }

    // Restore clip offset for audio regions
    if (this.targetRegion instanceof KGAudioRegion && this.newClipStartOffsetSeconds !== undefined) {
      this.targetRegion.setClipStartOffsetSeconds(this.originalClipStartOffsetSeconds);
      console.log(`Restored audio clip offset: ${this.newClipStartOffsetSeconds} → ${this.originalClipStartOffsetSeconds}`);
    }

    // Restore original region values
    this.targetRegion.setStartTick(this.originalStartTick);
    this.targetRegion.setLengthTicks(this.originalLength);

    const regionName = this.targetRegion.getName();
    console.log(`Restored region "${regionName}": start ${this.newStartTick} → ${this.originalStartTick}, length ${this.newLength} → ${this.originalLength}`);
  }

  getDescription(): string {
    const regionName = this.targetRegion ? this.targetRegion.getName() : `Region ${this.regionId}`;
    return `Resize region "${regionName}"`;
  }

  /**
   * Get the ID of the region being resized
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
   * Get the new length
   */
  public getNewLength(): number {
    return this.newLength;
  }

  /**
   * Get the original start position (only available after execute)
   */
  public getOriginalStartTick(): number {
    return this.originalStartTick;
  }

  /**
   * Get the original length (only available after execute)
   */
  public getOriginalLength(): number {
    return this.originalLength;
  }

  /**
   * Get the target region instance (only available after execute)
   */
  public getTargetRegion(): KGRegion | null {
    return this.targetRegion;
  }

  /**
   * Factory method to create a resize command for position only (move without length change)
   */
  public static createMoveCommand(regionId: string, newStartTick: number, currentLength: number): ResizeRegionCommand {
    return new ResizeRegionCommand(regionId, newStartTick, currentLength);
  }

  /**
   * Factory method to create a resize command for length only (resize without position change)
   */
  public static createLengthChangeCommand(regionId: string, currentStartFromBeat: number, newLength: number): ResizeRegionCommand {
    return new ResizeRegionCommand(regionId, currentStartFromBeat, newLength);
  }

  /**
   * Factory method to create a resize command from bar-based coordinates
   */
  public static fromBarCoordinates(
    regionId: string,
    newBarNumber: number,
    newLengthInBars: number,
    timeSignature: { numerator: number; denominator: number },
    newClipStartOffsetSeconds?: number
  ): ResizeRegionCommand {
    const ticksPerBar = timeSignature.numerator * 960 * (4 / timeSignature.denominator);
    const newStartTick = (newBarNumber - 1) * ticksPerBar;
    const newLength = newLengthInBars * ticksPerBar;

    return new ResizeRegionCommand(regionId, newStartTick, newLength, newClipStartOffsetSeconds);
  }
}
