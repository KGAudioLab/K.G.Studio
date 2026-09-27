import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { generateUniqueId } from '../../../util/miscUtil';
import type { RawMidiNote } from '../../../util/midiUtil';

/**
 * Command to insert a MIDI clip (from K.G.One generation) into a MIDI track.
 * All note data is stored so that redo recreates the full region with notes.
 */
export class ImportMidiClipCommand extends KGCommand {
  private trackId: string;
  private trackIndex: number;
  private regionId: string;
  private regionName: string;
  private startTick: number;
  private lengthTicks: number;
  private rawNotes: RawMidiNote[];
  private createdRegion: KGMidiRegion | null = null;

  constructor(
    trackId: string,
    trackIndex: number,
    startTick: number,
    lengthTicks: number,
    rawNotes: RawMidiNote[],
    regionName?: string,
    regionId?: string
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startTick = startTick;
    this.lengthTicks = lengthTicks;
    this.rawNotes = rawNotes;
    this.regionId = regionId || generateUniqueId('KGMidiRegion');
    this.regionName = regionName || 'KGOne Clip';
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const track = currentProject.getTracks().find(t => t.getId().toString() === this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    // Create the region
    this.createdRegion = new KGMidiRegion(
      this.regionId,
      this.trackId,
      this.trackIndex,
      this.regionName,
      this.startTick,
      this.lengthTicks
    );

    // Populate notes
    for (const raw of this.rawNotes) {
      const note = new KGMidiNote(
        generateUniqueId('KGMidiNote'),
        raw.startTick,
        raw.endTick,
        raw.pitch,
        raw.velocity
      );
      this.createdRegion.addNote(note);
    }

    track.addRegion(this.createdRegion);
    console.log(`Imported MIDI clip "${this.regionName}" (${this.rawNotes.length} notes) at beat ${this.startTick}`);
  }

  undo(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const track = currentProject.getTracks().find(t => t.getId().toString() === this.trackId);
    if (track) {
      track.removeRegion(this.regionId);
    }
    console.log(`Undid MIDI clip import "${this.regionName}"`);
  }

  getDescription(): string {
    return `Import MIDI clip "${this.regionName}"`;
  }

  getCreatedRegion(): KGMidiRegion | null {
    return this.createdRegion;
  }

  /**
   * Factory from bar-based coordinates (common UI pattern).
   */
  static fromBarCoordinates(
    trackId: string,
    trackIndex: number,
    barNumber: number,
    lengthInBars: number,
    ticksPerBar: number,
    rawNotes: RawMidiNote[],
    regionName?: string,
    regionId?: string
  ): ImportMidiClipCommand {
    const startTick = (barNumber - 1) * ticksPerBar;
    const lengthTicks = lengthInBars * ticksPerBar;
    return new ImportMidiClipCommand(
      trackId, trackIndex, startTick, lengthTicks,
      rawNotes, regionName, regionId
    );
  }
}
