import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import type { KGMidiRegion } from '../../region/KGMidiRegion';
import { createMidiRegionForTrack, KGMidiTrack } from '../../track/KGMidiTrack';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { generateUniqueId } from '../../../util/miscUtil';
import type { RawMidiNote } from '../../../util/midiUtil';
import { getInstVelaInstrument } from '../../../util/instvela/instruments';
import { convertInstVelaKeyswitches } from '../../../util/instvela/keyswitches';

/**
 * Command to insert a MIDI clip (from MIDI import or transcription) into a MIDI track.
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
    regionId?: string,
    private readonly options: { interpretKeyswitches?: boolean } = {},
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startTick = startTick;
    this.lengthTicks = lengthTicks;
    this.rawNotes = rawNotes;
    this.regionId = regionId || generateUniqueId('KGMidiRegion');
    this.regionName = regionName || 'MIDI Clip';
  }

  execute(): void {
    const core = KGCore.instance();
    const currentProject = core.getCurrentProject();
    const track = currentProject.getTracks().find(t => t.getId().toString() === this.trackId);
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    // Create the region
    this.createdRegion = createMidiRegionForTrack(
      track,
      this.regionId,
      this.trackIndex,
      this.regionName,
      this.startTick,
      this.lengthTicks
    );

    const notes = this.rawNotes.map(raw => new KGMidiNote(
      generateUniqueId('KGMidiNote'),
      raw.startTick,
      raw.endTick,
      raw.pitch,
      raw.velocity,
    ));
    const instrument = track instanceof KGMidiTrack && getInstVelaInstrument(track.getInstrument());
    this.createdRegion.setNotes(instrument && this.options.interpretKeyswitches !== false
      ? convertInstVelaKeyswitches(notes, instrument.keyswitch)
      : notes);

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
