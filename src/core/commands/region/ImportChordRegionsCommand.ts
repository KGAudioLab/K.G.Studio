import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { generateUniqueId } from '../../../util/miscUtil';
import type { ChordToMidiImportAction } from '../../../util/dialogUtil';
import {
  CHORD_REGION_IMPORT_REGION_NAME,
  type ImportedChordMidiNoteData,
} from '../../../util/chordRegionImportUtil';

interface MidiRegionSnapshot {
  startBeat: number;
  lengthInBeats: number;
  notes: KGMidiNote[];
  pitchBends: KGMidiPitchBend[];
  controllerEventsByType: KGMidiControllerEvent[][];
}

function cloneNote(note: KGMidiNote, startBeat = note.getStartBeat(), endBeat = note.getEndBeat()): KGMidiNote {
  return new KGMidiNote(note.getId(), startBeat, endBeat, note.getPitch(), note.getVelocity());
}

function clonePitchBend(event: KGMidiPitchBend, beat = event.getBeat()): KGMidiPitchBend {
  return new KGMidiPitchBend(event.getId(), beat, event.getValue());
}

function cloneControllerEvent(event: KGMidiControllerEvent, beat = event.getBeat()): KGMidiControllerEvent {
  return new KGMidiControllerEvent(event.getId(), beat, event.getValue());
}

export class ImportChordRegionsCommand extends KGCommand {
  private trackId: string;
  private trackIndex: number;
  private regionId: string;
  private regionName: string;
  private startBeat: number;
  private lengthInBeats: number;
  private notes: ImportedChordMidiNoteData[];
  private createdRegion: KGMidiRegion | null = null;
  private affectedRegion: KGMidiRegion | null = null;
  private action: ChordToMidiImportAction;
  private targetRegionId?: string;
  private originalSnapshot: MidiRegionSnapshot | null = null;

  constructor(
    trackId: string,
    trackIndex: number,
    startBeat: number,
    lengthInBeats: number,
    notes: ImportedChordMidiNoteData[],
    regionName: string = CHORD_REGION_IMPORT_REGION_NAME,
    regionId?: string,
    action: ChordToMidiImportAction = 'create',
    targetRegionId?: string,
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startBeat = startBeat;
    this.lengthInBeats = lengthInBeats;
    this.notes = notes;
    this.regionId = regionId ?? generateUniqueId('KGMidiRegion');
    this.regionName = regionName;
    this.action = action;
    this.targetRegionId = targetRegionId;
  }

  execute(): void {
    const track = KGCore.instance().getCurrentProject().getTracks().find(
      candidate => candidate.getId().toString() === this.trackId,
    );
    if (!track) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    if (this.action === 'create') {
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
      this.affectedRegion = this.createdRegion;
      return;
    }

    const targetRegion = track.getRegions().find(region => region.getId() === this.targetRegionId);
    if (!(targetRegion instanceof KGMidiRegion)) {
      throw new Error(`MIDI region ${this.targetRegionId ?? ''} not found`);
    }

    if (!this.originalSnapshot) {
      this.originalSnapshot = this.snapshotRegion(targetRegion);
    }

    const originalStart = targetRegion.getStartFromBeat();
    const originalEnd = originalStart + targetRegion.getLength();
    const importEnd = this.startBeat + this.lengthInBeats;
    const finalStart = Math.min(originalStart, this.startBeat);
    const finalEnd = Math.max(originalEnd, importEnd);

    const existingNotes = targetRegion.getNotes()
      .filter(note => {
        if (this.action !== 'replace') return true;
        const absoluteStart = originalStart + note.getStartBeat();
        const absoluteEnd = originalStart + note.getEndBeat();
        return absoluteStart >= importEnd || absoluteEnd <= this.startBeat;
      })
      .map(note => cloneNote(
        note,
        originalStart + note.getStartBeat() - finalStart,
        originalStart + note.getEndBeat() - finalStart,
      ));

    const importedNotes = this.notes.map(note => new KGMidiNote(
      generateUniqueId('KGMidiNote'),
      this.startBeat + note.startBeat - finalStart,
      this.startBeat + note.endBeat - finalStart,
      note.pitch,
      note.velocity,
    ));

    targetRegion.setStartFromBeat(finalStart);
    targetRegion.setLength(finalEnd - finalStart);
    targetRegion.setNotes([...existingNotes, ...importedNotes]);
    targetRegion.setPitchBends(targetRegion.getPitchBends().map(event => clonePitchBend(
      event,
      originalStart + event.getBeat() - finalStart,
    )));
    targetRegion.setControllerEventsByType(targetRegion.getControllerEventsByType().map(events => (
      events.map(event => cloneControllerEvent(
        event,
        originalStart + event.getBeat() - finalStart,
      ))
    )));
    this.affectedRegion = targetRegion;
  }

  undo(): void {
    const track = KGCore.instance().getCurrentProject().getTracks().find(
      candidate => candidate.getId().toString() === this.trackId,
    );
    if (!track) {
      throw new Error(`Track ${this.trackId} not found during undo`);
    }

    if (this.action === 'create') {
      track.removeRegion(this.regionId);
      return;
    }

    if (!this.affectedRegion || !this.originalSnapshot) {
      throw new Error('Cannot undo chord import: target region snapshot is missing');
    }

    this.restoreRegion(this.affectedRegion, this.originalSnapshot);
  }

  getDescription(): string {
    if (this.action === 'add') return `Add chord progression notes to "${this.regionName}"`;
    if (this.action === 'replace') return `Replace notes with chord progression in "${this.regionName}"`;
    return `Import chord progression "${this.regionName}"`;
  }

  getCreatedRegion(): KGMidiRegion | null {
    return this.createdRegion;
  }

  getAffectedRegion(): KGMidiRegion | null {
    return this.affectedRegion;
  }

  private snapshotRegion(region: KGMidiRegion): MidiRegionSnapshot {
    return {
      startBeat: region.getStartFromBeat(),
      lengthInBeats: region.getLength(),
      notes: region.getNotes().map(note => cloneNote(note)),
      pitchBends: region.getPitchBends().map(event => clonePitchBend(event)),
      controllerEventsByType: region.getControllerEventsByType().map(events => (
        events.map(event => cloneControllerEvent(event))
      )),
    };
  }

  private restoreRegion(region: KGMidiRegion, snapshot: MidiRegionSnapshot): void {
    region.setStartFromBeat(snapshot.startBeat);
    region.setLength(snapshot.lengthInBeats);
    region.setNotes(snapshot.notes.map(note => cloneNote(note)));
    region.setPitchBends(snapshot.pitchBends.map(event => clonePitchBend(event)));
    region.setControllerEventsByType(snapshot.controllerEventsByType.map(events => (
      events.map(event => cloneControllerEvent(event))
    )));
  }
}
