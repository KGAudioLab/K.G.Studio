import { KGCore } from '../../KGCore';
import { KGMidiTrack, type MidiTransposeSettings } from '../../track/KGMidiTrack';
import type { KGMidiNote } from '../../midi/KGMidiNote';
import { validateTransposeSettings, validateTransposedPitch } from '../../../util/midiTransposeUtil';
import { KGCommand } from '../KGCommand';

interface NotePitchSnapshot {
  note: KGMidiNote;
  pitch: number;
}

export class UpdateMidiTrackTransposeCommand extends KGCommand {
  private readonly trackId: number;
  private readonly nextSettings: MidiTransposeSettings;
  private readonly nextNoTranspose: boolean;
  private targetTrack: KGMidiTrack | null = null;
  private previousSettings: MidiTransposeSettings | null = null;
  private previousNoTranspose = false;
  private noteSnapshots: NotePitchSnapshot[] = [];

  constructor(trackId: number, settings: MidiTransposeSettings, noTranspose: boolean) {
    super();
    this.trackId = trackId;
    this.nextSettings = { ...settings };
    this.nextNoTranspose = noTranspose;
  }

  execute(): void {
    validateTransposeSettings(this.nextSettings);
    const track = KGCore.instance().getCurrentProject().getTracks()
      .find(candidate => candidate.getId() === this.trackId);
    if (!(track instanceof KGMidiTrack)) {
      throw new Error(`MIDI track with ID ${this.trackId} not found.`);
    }

    this.targetTrack = track;
    this.previousSettings = track.getTransposeSettings();
    this.previousNoTranspose = track.getNoTranspose();
    this.noteSnapshots = [];

    const delta = this.nextNoTranspose ? 0 : this.nextSettings.transpose - this.previousSettings.transpose;
    if (delta !== 0) {
      for (const region of track.getRegions()) {
        if (region.getTransposeSettingsOverride() !== null) continue;
        for (const note of region.getNotes()) {
          validateTransposedPitch(note.getPitch() + delta);
          this.noteSnapshots.push({ note, pitch: note.getPitch() });
        }
      }
    }

    for (const snapshot of this.noteSnapshots) snapshot.note.setPitch(snapshot.pitch + delta);
    track.setTransposeSettings(this.nextSettings);
    track.setNoTranspose(this.nextNoTranspose);
  }

  undo(): void {
    if (!this.targetTrack || !this.previousSettings) throw new Error('Cannot undo track transposition.');
    for (const snapshot of this.noteSnapshots) snapshot.note.setPitch(snapshot.pitch);
    this.targetTrack.setTransposeSettings(this.previousSettings);
    this.targetTrack.setNoTranspose(this.previousNoTranspose);
  }

  getDescription(): string {
    return 'Update MIDI track transpose settings';
  }
}
