import { KGCore } from '../../KGCore';
import type { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiTrack, type MidiTransposeSettings } from '../../track/KGMidiTrack';
import { getEffectiveTransposeSettings, validateTransposeSettings, validateTransposedPitch } from '../../../util/midiTransposeUtil';
import { KGCommand } from '../KGCommand';

interface NotePitchSnapshot {
  note: KGMidiNote;
  pitch: number;
}

export class UpdateMidiRegionTransposeCommand extends KGCommand {
  private readonly regionId: string;
  private readonly nextOverride: MidiTransposeSettings | null;
  private targetRegion: KGMidiRegion | null = null;
  private previousOverride: MidiTransposeSettings | null = null;
  private noteSnapshots: NotePitchSnapshot[] = [];

  constructor(regionId: string, settingsOverride: MidiTransposeSettings | null) {
    super();
    this.regionId = regionId;
    this.nextOverride = settingsOverride ? { ...settingsOverride } : null;
  }

  execute(): void {
    if (this.nextOverride) validateTransposeSettings(this.nextOverride);
    const track = KGCore.instance().getCurrentProject().getTracks().find(candidate => (
      candidate instanceof KGMidiTrack && candidate.getRegions().some(region => region.getId() === this.regionId)
    ));
    const region = track instanceof KGMidiTrack
      ? track.getRegions().find(candidate => candidate.getId() === this.regionId)
      : undefined;
    if (!(track instanceof KGMidiTrack) || !(region instanceof KGMidiRegion)) {
      throw new Error(`MIDI region with ID ${this.regionId} not found.`);
    }

    this.targetRegion = region;
    this.previousOverride = region.getTransposeSettingsOverride();
    this.noteSnapshots = [];
    const previousEffective = getEffectiveTransposeSettings(track, region);
    const nextEffective = this.nextOverride ?? track.getTransposeSettings();
    const delta = track.getNoTranspose() ? 0 : nextEffective.transpose - previousEffective.transpose;

    if (delta !== 0) {
      for (const note of region.getNotes()) {
        validateTransposedPitch(note.getPitch() + delta);
        this.noteSnapshots.push({ note, pitch: note.getPitch() });
      }
    }

    for (const snapshot of this.noteSnapshots) snapshot.note.setPitch(snapshot.pitch + delta);
    region.setTransposeSettingsOverride(this.nextOverride);
  }

  undo(): void {
    if (!this.targetRegion) throw new Error('Cannot undo region transposition.');
    for (const snapshot of this.noteSnapshots) snapshot.note.setPitch(snapshot.pitch);
    this.targetRegion.setTransposeSettingsOverride(this.previousOverride);
  }

  getDescription(): string {
    return 'Update MIDI region transpose settings';
  }
}
