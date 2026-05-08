import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiControllerEvent } from '../../midi/KGMidiControllerEvent';
import { KGMidiNote } from '../../midi/KGMidiNote';
import { KGMidiPitchBend } from '../../midi/KGMidiPitchBend';
import { KGMidiRegion } from '../../region/KGMidiRegion';

interface DeletedNoteData {
  note: KGMidiNote;
  regionId: string;
  originalIndex: number;
}

interface DeletedPitchBendData {
  pitchBend: KGMidiPitchBend;
  regionId: string;
  originalIndex: number;
}

interface DeletedControllerEventData {
  controller: number;
  controllerEvent: KGMidiControllerEvent;
  regionId: string;
  originalIndex: number;
}

export class DeleteMidiEventsCommand extends KGCommand {
  private noteIds: string[];
  private pitchBendIds: string[];
  private controllerEventIds: string[];
  private deletedNoteData: DeletedNoteData[] = [];
  private deletedPitchBendData: DeletedPitchBendData[] = [];
  private deletedControllerEventData: DeletedControllerEventData[] = [];

  constructor(noteIds: string[] = [], pitchBendIds: string[] = [], controllerEventIds: string[] = []) {
    super();
    this.noteIds = noteIds;
    this.pitchBendIds = pitchBendIds;
    this.controllerEventIds = controllerEventIds;
  }

  execute(): void {
    const core = KGCore.instance();
    const tracks = core.getCurrentProject().getTracks();

    this.deletedNoteData = [];
    this.deletedPitchBendData = [];
    this.deletedControllerEventData = [];

    for (const noteId of this.noteIds) {
      for (const track of tracks) {
        for (const region of track.getRegions()) {
          if (!(region instanceof KGMidiRegion)) continue;

          const noteIndex = region.getNotes().findIndex(note => note.getId() === noteId);
          if (noteIndex === -1) continue;

          this.deletedNoteData.push({
            note: region.getNotes()[noteIndex],
            regionId: region.getId(),
            originalIndex: noteIndex,
          });
          break;
        }
      }
    }

    for (const pitchBendId of this.pitchBendIds) {
      for (const track of tracks) {
        for (const region of track.getRegions()) {
          if (!(region instanceof KGMidiRegion)) continue;

          const pitchBendIndex = region.getPitchBends().findIndex(pitchBend => pitchBend.getId() === pitchBendId);
          if (pitchBendIndex === -1) continue;

          this.deletedPitchBendData.push({
            pitchBend: region.getPitchBends()[pitchBendIndex],
            regionId: region.getId(),
            originalIndex: pitchBendIndex,
          });
          break;
        }
      }
    }

    for (const controllerEventId of this.controllerEventIds) {
      for (const track of tracks) {
        for (const region of track.getRegions()) {
          if (!(region instanceof KGMidiRegion)) continue;

          const flattened = region.getAllControllerEventsFlattened();
          const flattenedIndex = flattened.findIndex(({ event }) => event.getId() === controllerEventId);
          if (flattenedIndex === -1) continue;

          const { controller, event } = flattened[flattenedIndex];
          const originalIndex = region.getControllerEvents(controller).findIndex(candidate => candidate.getId() === controllerEventId);
          this.deletedControllerEventData.push({
            controller,
            controllerEvent: event,
            regionId: region.getId(),
            originalIndex,
          });
          break;
        }
      }
    }

    if (this.deletedNoteData.length === 0 && this.deletedPitchBendData.length === 0 && this.deletedControllerEventData.length === 0) {
      throw new Error('No MIDI events found to delete');
    }

    this.deletedNoteData.sort((a, b) => b.originalIndex - a.originalIndex);
    this.deletedPitchBendData.sort((a, b) => b.originalIndex - a.originalIndex);
    this.deletedControllerEventData.sort((a, b) => b.originalIndex - a.originalIndex);

    for (const data of this.deletedNoteData) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removeNote(data.note.getId());

      const selectedNote = core.getSelectedItems().find(item => item instanceof KGMidiNote && item.getId() === data.note.getId());
      if (selectedNote) {
        core.removeSelectedItem(selectedNote);
      }
    }

    for (const data of this.deletedPitchBendData) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removePitchBend(data.pitchBend.getId());

      const selectedPitchBend = core.getSelectedItems().find(
        item => item instanceof KGMidiPitchBend && item.getId() === data.pitchBend.getId()
      );
      if (selectedPitchBend) {
        core.removeSelectedItem(selectedPitchBend);
      }
    }

    for (const data of this.deletedControllerEventData) {
      const region = this.resolveRegion(tracks, data.regionId);
      region.removeControllerEvent(data.controller, data.controllerEvent.getId());

      const selectedControllerEvent = core.getSelectedItems().find(
        item => item instanceof KGMidiControllerEvent && item.getId() === data.controllerEvent.getId()
      );
      if (selectedControllerEvent) {
        core.removeSelectedItem(selectedControllerEvent);
      }
    }
  }

  undo(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();

    for (const data of [...this.deletedNoteData].sort((a, b) => a.originalIndex - b.originalIndex)) {
      const region = this.resolveRegion(tracks, data.regionId);
      const notes = region.getNotes();
      if (data.originalIndex >= 0 && data.originalIndex <= notes.length) {
        notes.splice(data.originalIndex, 0, data.note);
        region.setNotes(notes);
      } else {
        region.addNote(data.note);
      }
    }

    for (const data of [...this.deletedPitchBendData].sort((a, b) => a.originalIndex - b.originalIndex)) {
      const region = this.resolveRegion(tracks, data.regionId);
      const pitchBends = region.getPitchBends();
      if (data.originalIndex >= 0 && data.originalIndex <= pitchBends.length) {
        pitchBends.splice(data.originalIndex, 0, data.pitchBend);
        region.setPitchBends(pitchBends);
      } else {
        region.addPitchBend(data.pitchBend);
      }
    }

    for (const data of [...this.deletedControllerEventData].sort((a, b) => a.originalIndex - b.originalIndex)) {
      const region = this.resolveRegion(tracks, data.regionId);
      const controllerEvents = region.getControllerEvents(data.controller);
      if (data.originalIndex >= 0 && data.originalIndex <= controllerEvents.length) {
        controllerEvents.splice(data.originalIndex, 0, data.controllerEvent);
        region.setControllerEvents(data.controller, controllerEvents);
      } else {
        region.addControllerEvent(data.controller, data.controllerEvent);
      }
    }
  }

  getDescription(): string {
    const noteCount = this.noteIds.length;
    const pitchBendCount = this.pitchBendIds.length;
    const controllerEventCount = this.controllerEventIds.length;
    const parts: string[] = [];
    if (noteCount > 0) {
      parts.push(`${noteCount} note${noteCount === 1 ? '' : 's'}`);
    }
    if (pitchBendCount > 0) {
      parts.push(`${pitchBendCount} pitch bend${pitchBendCount === 1 ? '' : 's'}`);
    }
    if (controllerEventCount > 0) {
      parts.push(`${controllerEventCount} controller event${controllerEventCount === 1 ? '' : 's'}`);
    }

    if (parts.length === 0) {
      return 'Delete MIDI events';
    }

    return `Delete ${parts.join(' and ')}`;
  }

  private resolveRegion(tracks: Array<{ getRegions(): unknown[] }>, regionId: string): KGMidiRegion {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate instanceof KGMidiRegion && candidate.getId() === regionId);
      if (region instanceof KGMidiRegion) {
        return region;
      }
    }

    throw new Error(`MIDI region with ID ${regionId} not found`);
  }
}
