import type { Selectable } from '../../../components/interfaces';
import { generateUniqueId } from '../../../util/miscUtil';
import { KGCore } from '../../KGCore';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGCommand } from '../KGCommand';

interface SplitNoteRecord {
  originalNoteId: string;
  leftNoteId: string;
  rightNoteId: string;
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
}

export class SplitSelectedNotesCommand extends KGCommand {
  private readonly regionId: string;
  private readonly selectedNoteIds: string[];
  private readonly splitAtBeat: number;

  private targetRegion: KGMidiRegion | null = null;
  private originalNotes: KGMidiNote[] = [];
  private originalSelectedItems: Selectable[] = [];
  private splitNoteRecords: SplitNoteRecord[] = [];
  private unchangedSelectedNoteIds: string[] = [];

  constructor(regionId: string, selectedNoteIds: string[], splitAtBeat: number) {
    super();
    this.regionId = regionId;
    this.selectedNoteIds = [...selectedNoteIds];
    this.splitAtBeat = splitAtBeat;
  }

  execute(): void {
    const core = KGCore.instance();
    const targetRegion = this.resolveTargetRegion();
    const noteIdSet = new Set(this.selectedNoteIds);
    const currentNotes = targetRegion.getNotes();
    const selectedNotes = currentNotes.filter(note => noteIdSet.has(note.getId()));

    if (selectedNotes.length === 0) {
      throw new Error('No selected notes were found in the active MIDI region.');
    }

    if (this.originalSelectedItems.length === 0) {
      this.originalSelectedItems = [...core.getSelectedItems()];
    }

    if (this.originalNotes.length === 0) {
      this.originalNotes = [...currentNotes];
    }

    if (this.splitNoteRecords.length === 0) {
      this.splitNoteRecords = selectedNotes
        .filter(note => note.getStartBeat() < this.splitAtBeat && this.splitAtBeat < note.getEndBeat())
        .map(note => ({
          originalNoteId: note.getId(),
          leftNoteId: generateUniqueId('KGMidiNote'),
          rightNoteId: generateUniqueId('KGMidiNote'),
          startBeat: note.getStartBeat(),
          endBeat: note.getEndBeat(),
          pitch: note.getPitch(),
          velocity: note.getVelocity(),
        }));
    }

    if (this.splitNoteRecords.length === 0) {
      throw new Error('The playhead is not inside any selected note. Move the playhead inside a selected note before splitting.');
    }

    const splitRecordByOriginalId = new Map(
      this.splitNoteRecords.map(record => [record.originalNoteId, record])
    );
    this.unchangedSelectedNoteIds = selectedNotes
      .filter(note => !splitRecordByOriginalId.has(note.getId()))
      .map(note => note.getId());

    const nextNotes: KGMidiNote[] = [];
    const nextSelectedNotes: KGMidiNote[] = [];

    for (const note of currentNotes) {
      const splitRecord = splitRecordByOriginalId.get(note.getId());
      if (!splitRecord) {
        note.deselect();
        nextNotes.push(note);

        if (noteIdSet.has(note.getId())) {
          note.select();
          nextSelectedNotes.push(note);
        }
        continue;
      }

      const leftNote = new KGMidiNote(
        splitRecord.leftNoteId,
        splitRecord.startBeat,
        this.splitAtBeat,
        splitRecord.pitch,
        splitRecord.velocity
      );
      const rightNote = new KGMidiNote(
        splitRecord.rightNoteId,
        this.splitAtBeat,
        splitRecord.endBeat,
        splitRecord.pitch,
        splitRecord.velocity
      );

      leftNote.select();
      rightNote.select();
      nextNotes.push(leftNote, rightNote);
      nextSelectedNotes.push(leftNote, rightNote);
    }

    targetRegion.setNotes(nextNotes);
    core.clearSelectedItems();
    core.addSelectedItems(nextSelectedNotes);
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: split was never executed');
    }

    const core = KGCore.instance();
    this.targetRegion.setNotes([...this.originalNotes]);
    this.originalNotes.forEach(note => note.deselect());
    this.originalSelectedItems.forEach(item => item.select());
    core.clearSelectedItems();
    core.addSelectedItems(this.originalSelectedItems);
  }

  getDescription(): string {
    const splitCount = this.splitNoteRecords.length || this.selectedNoteIds.length;
    return splitCount === 1 ? 'Split note' : `Split ${splitCount} notes`;
  }

  public getSplitCount(): number {
    return this.splitNoteRecords.length;
  }

  public getUnchangedSelectedNoteIds(): string[] {
    return [...this.unchangedSelectedNoteIds];
  }

  private resolveTargetRegion(): KGMidiRegion {
    if (this.targetRegion) {
      return this.targetRegion;
    }

    const tracks = KGCore.instance().getCurrentProject().getTracks();
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === this.regionId);
      if (region instanceof KGMidiRegion) {
        this.targetRegion = region;
        return region;
      }
    }

    throw new Error(`MIDI region with ID ${this.regionId} not found`);
  }
}
