import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { KGMidiTrack } from '../../track/KGMidiTrack';
import { KGTrack } from '../../track/KGTrack';
import { KGTrackAutomationPoint } from '../../track/KGTrackAutomationPoint';
import { generateUniqueId } from '../../../util/miscUtil';

export interface DuplicateTrackOptions {
  includeAutomation: boolean;
  includeRegions: boolean;
}

export function generateDuplicateTrackName(originalName: string, tracks: KGTrack[]): string {
  const existingNames = new Set(tracks.map(track => track.getName()));
  let counter = 1;
  while (existingNames.has(`${originalName} (${counter})`)) {
    counter += 1;
  }
  return `${originalName} (${counter})`;
}

function cloneAutomationPoint(point: KGTrackAutomationPoint): KGTrackAutomationPoint {
  return new KGTrackAutomationPoint(
    generateUniqueId('KGTrackAutomationPoint'),
    point.getBeat(),
    point.getValue(),
  );
}

function cloneMidiRegion(region: KGMidiRegion, trackId: number, trackIndex: number): KGMidiRegion {
  const duplicate = new KGMidiRegion(
    generateUniqueId('KGMidiRegion'),
    trackId.toString(),
    trackIndex,
    region.getName(),
    region.getStartFromBeat(),
    region.getLength(),
  );
  duplicate.setColor(region.getColor());
  duplicate.setTransposeSettingsOverride(region.getTransposeSettingsOverride());
  duplicate.setNotes(region.getNotes().map(note => new KGMidiNote(
    generateUniqueId('KGMidiNote'),
    note.getStartBeat(),
    note.getEndBeat(),
    note.getPitch(),
    note.getVelocity(),
  )));
  duplicate.setPitchBends(region.getPitchBends().map(event => new KGMidiPitchBend(
    generateUniqueId('KGMidiPitchBend'),
    event.getBeat(),
    event.getValue(),
  )));
  duplicate.setControllerEventsByType(region.getControllerEventsByType().map(events => (
    events.map(event => new KGMidiControllerEvent(
      generateUniqueId('KGMidiControllerEvent'),
      event.getBeat(),
      event.getValue(),
    ))
  )));
  return duplicate;
}

function cloneAudioRegion(region: KGAudioRegion, trackId: number, trackIndex: number): KGAudioRegion {
  const duplicate = new KGAudioRegion(
    generateUniqueId('KGAudioRegion'),
    trackId.toString(),
    trackIndex,
    region.getName(),
    region.getStartFromBeat(),
    region.getLength(),
    region.getAudioFileId(),
    region.getAudioFileName(),
    region.getAudioDurationSeconds(),
    region.getClipStartOffsetSeconds(),
  );
  duplicate.setColor(region.getColor());
  return duplicate;
}

export class DuplicateTrackCommand extends KGCommand {
  private readonly sourceTrackId: number;
  private readonly options: DuplicateTrackOptions;
  private readonly onSelectTrack?: (trackId: string) => void;
  private duplicateTrack: KGMidiTrack | KGAudioTrack | null = null;
  private duplicateTrackId: number | null = null;

  constructor(sourceTrackId: number, options: DuplicateTrackOptions, onSelectTrack?: (trackId: string) => void) {
    super();
    this.sourceTrackId = sourceTrackId;
    this.options = { ...options };
    this.onSelectTrack = onSelectTrack;
  }

  execute(): void {
    const project = KGCore.instance().getCurrentProject();
    const tracks = project.getTracks();
    const sourceTrack = tracks.find(track => track.getId() === this.sourceTrackId);
    if (!sourceTrack) {
      throw new Error(`Track with ID ${this.sourceTrackId} not found`);
    }

    const insertionIndex = tracks.indexOf(sourceTrack) + 1;
    if (!this.duplicateTrack) {
      this.duplicateTrackId = tracks.length > 0
        ? Math.max(...tracks.map(track => track.getId())) + 1
        : 1;
      this.duplicateTrack = this.createDuplicate(sourceTrack, insertionIndex, tracks);
    }

    const updatedTracks = [...tracks];
    updatedTracks.splice(insertionIndex, 0, this.duplicateTrack);
    updatedTracks.forEach((track, index) => track.setTrackIndex(index));
    project.setTracks(updatedTracks);

    this.createMidiAudioResources(this.duplicateTrack);
    this.onSelectTrack?.(this.duplicateTrack.getId().toString());
  }

  undo(): void {
    if (!this.duplicateTrack) {
      throw new Error('Cannot undo: no duplicated track was created');
    }

    const project = KGCore.instance().getCurrentProject();
    const tracks = project.getTracks();
    if (!tracks.some(track => track.getId() === this.duplicateTrack!.getId())) {
      throw new Error('Cannot undo: duplicated track is not in the project');
    }

    const audioInterface = KGAudioInterface.instance();
    void audioInterface.removeTrackSynth(this.duplicateTrack.getId().toString());
    void audioInterface.removeTrackAudioPlayerBus(this.duplicateTrack.getId().toString());

    const updatedTracks = tracks.filter(track => track.getId() !== this.duplicateTrack!.getId());
    updatedTracks.forEach((track, index) => track.setTrackIndex(index));
    project.setTracks(updatedTracks);
    this.onSelectTrack?.(this.sourceTrackId.toString());
  }

  getDescription(): string {
    return this.duplicateTrack
      ? `Duplicate track "${this.duplicateTrack.getName()}"`
      : `Duplicate track ${this.sourceTrackId}`;
  }

  getDuplicateTrackId(): number | null {
    return this.duplicateTrackId;
  }

  getDuplicateTrack(): KGMidiTrack | KGAudioTrack | null {
    return this.duplicateTrack;
  }

  private createDuplicate(source: KGTrack, trackIndex: number, tracks: KGTrack[]): KGMidiTrack | KGAudioTrack {
    const duplicateId = this.duplicateTrackId!;
    const duplicateName = generateDuplicateTrackName(source.getName(), tracks);
    let duplicate: KGMidiTrack | KGAudioTrack;

    if (source instanceof KGMidiTrack) {
      duplicate = new KGMidiTrack(duplicateName, duplicateId, source.getInstrument(), source.getVolume());
      duplicate.setTransposeSettings(source.getTransposeSettings());
      duplicate.setNoTranspose(source.getNoTranspose());
      if (this.options.includeRegions) {
        duplicate.setRegions(source.getRegions().map(region => cloneMidiRegion(region, duplicateId, trackIndex)));
      }
    } else if (source instanceof KGAudioTrack) {
      duplicate = new KGAudioTrack(duplicateName, duplicateId, source.getVolume());
      if (this.options.includeRegions) {
        duplicate.setRegions(source.getRegions().map(region => cloneAudioRegion(region, duplicateId, trackIndex)));
      }
    } else {
      throw new Error('Only MIDI and audio tracks can be duplicated');
    }

    duplicate.setTrackIndex(trackIndex);
    duplicate.setColor(source.getColor());
    duplicate.setMuted(source.getMuted());
    duplicate.setSolo(source.getSolo());
    if (this.options.includeAutomation) {
      duplicate.setVolumeAutomation(source.getVolumeAutomation().map(cloneAutomationPoint));
      duplicate.setPanAutomation(source.getPanAutomation().map(cloneAutomationPoint));
    }
    return duplicate;
  }

  private createMidiAudioResources(track: KGMidiTrack | KGAudioTrack): void {
    if (track instanceof KGMidiTrack) {
      void KGAudioInterface.instance().createTrackSynth(track.getId().toString(), track.getInstrument());
    }
    // Audio-track buses and shared file buffers are restored by the store's
    // centralized project refresh/hydration path after execute and redo.
  }
}
