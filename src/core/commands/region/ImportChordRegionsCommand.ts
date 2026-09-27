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
  startTick: number;
  lengthTicks: number;
  notes: KGMidiNote[];
  pitchBends: KGMidiPitchBend[];
  controllerEventsByType: KGMidiControllerEvent[][];
}

function cloneNote(note: KGMidiNote, startTick: number = note.getStartTick(), endTick: number = note.getEndTick()): KGMidiNote {
  return new KGMidiNote(note.getId(), startTick, endTick, note.getPitch(), note.getVelocity());
}

function clonePitchBend(event: KGMidiPitchBend, tick: number = event.getTick()): KGMidiPitchBend {
  return new KGMidiPitchBend(event.getId(), tick, event.getValue());
}

function cloneControllerEvent(event: KGMidiControllerEvent, tick: number = event.getTick()): KGMidiControllerEvent {
  return new KGMidiControllerEvent(event.getId(), tick, event.getValue());
}

export class ImportChordRegionsCommand extends KGCommand {
  private trackId: string;
  private trackIndex: number;
  private regionId: string;
  private regionName: string;
  private startTick: number;
  private lengthTicks: number;
  private notes: ImportedChordMidiNoteData[];
  private createdRegion: KGMidiRegion | null = null;
  private affectedRegion: KGMidiRegion | null = null;
  private action: ChordToMidiImportAction;
  private targetRegionId?: string;
  private originalSnapshot: MidiRegionSnapshot | null = null;

  constructor(
    trackId: string,
    trackIndex: number,
    startTick: number,
    lengthTicks: number,
    notes: ImportedChordMidiNoteData[],
    regionName: string = CHORD_REGION_IMPORT_REGION_NAME,
    regionId?: string,
    action: ChordToMidiImportAction = 'create',
    targetRegionId?: string,
  ) {
    super();
    this.trackId = trackId;
    this.trackIndex = trackIndex;
    this.startTick = startTick;
    this.lengthTicks = lengthTicks;
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
        this.startTick,
        this.lengthTicks,
      );

      this.notes.forEach(noteData => {
        this.createdRegion?.addNote(new KGMidiNote(
          generateUniqueId('KGMidiNote'),
          noteData.startTick,
          noteData.endTick,
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

    const originalStart = targetRegion.getStartTick();
    const originalEnd = originalStart + targetRegion.getLengthTicks();
    const importEnd = this.startTick + this.lengthTicks;
    const finalStart = Math.min(originalStart, this.startTick);
    const finalEnd = Math.max(originalEnd, importEnd);

    const existingNotes = targetRegion.getNotes()
      .filter(note => {
        if (this.action !== 'replace') return true;
        const absoluteStart = originalStart + note.getStartTick();
        const absoluteEnd = originalStart + note.getEndTick();
        return absoluteStart >= importEnd || absoluteEnd <= this.startTick;
      })
      .map(note => cloneNote(
        note,
        originalStart + note.getStartTick() - finalStart,
        originalStart + note.getEndTick() - finalStart,
      ));

    const importedNotes = this.notes.map(note => new KGMidiNote(
      generateUniqueId('KGMidiNote'),
      this.startTick + note.startTick - finalStart,
      this.startTick + note.endTick - finalStart,
      note.pitch,
      note.velocity,
    ));

    targetRegion.setStartTick(finalStart);
    targetRegion.setLengthTicks(finalEnd - finalStart);
    targetRegion.setNotes([...existingNotes, ...importedNotes]);
    targetRegion.setPitchBends(targetRegion.getPitchBends().map(event => clonePitchBend(
      event,
      originalStart + event.getTick() - finalStart,
    )));
    targetRegion.setControllerEventsByType(targetRegion.getControllerEventsByType().map(events => (
      events.map(event => cloneControllerEvent(
        event,
        originalStart + event.getTick() - finalStart,
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
      startTick: region.getStartTick(),
      lengthTicks: region.getLengthTicks(),
      notes: region.getNotes().map(note => cloneNote(note)),
      pitchBends: region.getPitchBends().map(event => clonePitchBend(event)),
      controllerEventsByType: region.getControllerEventsByType().map(events => (
        events.map(event => cloneControllerEvent(event))
      )),
    };
  }

  private restoreRegion(region: KGMidiRegion, snapshot: MidiRegionSnapshot): void {
    region.setStartTick(snapshot.startTick);
    region.setLengthTicks(snapshot.lengthTicks);
    region.setNotes(snapshot.notes.map(note => cloneNote(note)));
    region.setPitchBends(snapshot.pitchBends.map(event => clonePitchBend(event)));
    region.setControllerEventsByType(snapshot.controllerEventsByType.map(events => (
      events.map(event => cloneControllerEvent(event))
    )));
  }
}
