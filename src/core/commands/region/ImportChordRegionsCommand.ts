import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { generateUniqueId } from '../../../util/miscUtil';
import {
  CHORD_REGION_IMPORT_REGION_NAME,
  type ImportedChordMidiNoteData,
} from '../../../util/chordRegionImportUtil';

export class ImportChordRegionsCommand extends KGCommand {
  private trackId: string;
  private trackIndex: number;
  private regionId: string;
  private regionName: string;
  private startBeat: number;
  private lengthInBeats: number;
  private notes: ImportedChordMidiNoteData[];
  private createdRegion: KGMidiRegion | null = null;

  constructor(
    trackId: string,
    trackIndex: number,
    startBeat: number,
    lengthInBeats: number,
    notes: ImportedChordMidiNoteData[],
    regionName: string = CHORD_REGION_IMPORT_REGION_NAME,
    regionId?: string,
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startBeat = startBeat;
    this.lengthInBeats = lengthInBeats;
    this.notes = notes;
    this.regionId = regionId ?? generateUniqueId('KGMidiRegion');
    this.regionName = regionName;
  }

  execute(): void {
    const track = KGCore.instance().getCurrentProject().getTracks().find(
      candidate => candidate.getId().toString() === this.trackId,
    );
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    this.createdRegion = new KGMidiRegion(
      this.regionId,
      this.trackId,
      this.trackIndex,
      this.regionName,
      this.startBeat,
      this.lengthInBeats,
    );

    this.notes.forEach(noteData => {
      this.createdRegion?.addNote(new KGMidiNote(
        generateUniqueId('KGMidiNote'),
        noteData.startBeat,
        noteData.endBeat,
        noteData.pitch,
        noteData.velocity,
      ));
    });

    track.addRegion(this.createdRegion);
  }

  undo(): void {
    const track = KGCore.instance().getCurrentProject().getTracks().find(
      candidate => candidate.getId().toString() === this.trackId,
    );
    if (!track) {
      throw new Error(`Track ${this.trackId} not found during undo`);
    }

    track.removeRegion(this.regionId);
  }

  getDescription(): string {
    return `Import chord progression "${this.regionName}"`;
  }

  getCreatedRegion(): KGMidiRegion | null {
    return this.createdRegion;
  }
}
