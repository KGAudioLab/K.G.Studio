import React, { useEffect, useRef, useState } from 'react';
import './ListEventPanel.css';
import { FaPlus, FaTrash } from 'react-icons/fa';
import KGDropdown from './common/KGDropdown';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiControllerEvent } from '../core/midi/KGMidiControllerEvent';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiPitchBend } from '../core/midi/KGMidiPitchBend';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import {
  clampMidiControllerValue,
  clampMidiPitchBendValue,
  formatMidiEventLength,
  formatMidiEventPosition,
  MIDI_EVENT_TICKS_PER_BEAT,
  MIDI_PITCH_BEND_CENTER,
  MIDI_PITCH_BEND_MAX_SIGNED,
  MIDI_PITCH_BEND_MIN_SIGNED,
  midiPitchBendToNormalized,
  midiPitchBendToSignedValue,
  noteNameToPitch,
  parseMidiEventLengthDelta,
  parseMidiEventLength,
  parseMidiEventPositionDelta,
  parseMidiEventPosition,
  pitchToNoteNameString,
  signedPitchBendToMidiValue
} from '../util/midiUtil';
import { isModifierKeyPressed } from '../util/osUtil';
import { PIANO_ROLL_CONSTANTS } from '../constants';
import { CreateMidiEventsCommand, CreateNoteCommand, DeleteMidiEventsCommand } from '../core/commands';
import { UpdateControllerEventPropertiesCommand } from '../core/commands/note/UpdateControllerEventPropertiesCommand';
import { UpdateNotePropertiesCommand } from '../core/commands/note/UpdateNotePropertiesCommand';
import { UpdatePitchBendPropertiesCommand } from '../core/commands/note/UpdatePitchBendPropertiesCommand';
import { showAlert } from '../util/dialogUtil';

interface ListEventPanelProps {
  isVisible: boolean;
}

interface NoteRowData {
  id: string;
  type: 'note';
  note: KGMidiNote;
  absoluteStartBeat: number;
  durationBeats: number;
}

interface PitchBendRowData {
  id: string;
  type: 'pitch-bend';
  pitchBend: KGMidiPitchBend;
  absoluteBeat: number;
}

interface ControllerRowData {
  id: string;
  type: 'controller';
  controller: number;
  controllerEvent: KGMidiControllerEvent;
  absoluteBeat: number;
}

type EventRowData = NoteRowData | PitchBendRowData | ControllerRowData;
type EditableColumn = 'position' | 'num' | 'val' | 'length';

interface EditingCell {
  eventId: string;
  column: EditableColumn;
  value: string;
}

type AddEventType = 'note' | 'pitch-bend' | 'controller';

const ADD_EVENT_TYPE_OPTIONS = [
  { label: 'Note', value: 'note' },
  { label: 'Pitch Bend', value: 'pitch-bend' },
  { label: 'Controller', value: 'controller' },
] as const;

const parseVelocityInput = (raw: string): { velocity: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'Velocity must be an integer between 0 and 127.' };
  }

  const velocity = parseInt(trimmed, 10);
  if (velocity < 0 || velocity > 127) {
    return { error: 'Velocity must be between 0 and 127.' };
  }

  return { velocity };
};

const parseVelocityDeltaInput = (raw: string): { delta: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^[+-]\d+$/.test(trimmed)) {
    return { error: 'Use velocity delta like +10 or -5.' };
  }

  return { delta: parseInt(trimmed, 10) };
};

const parseNoteNameInput = (raw: string): { pitch: number } | { error: string } => {
  try {
    return { pitch: noteNameToPitch(raw.trim()) };
  } catch {
    return { error: 'Use note names like C3, C#3, or Cb3.' };
  }
};

const parsePitchDeltaInput = (raw: string): { delta: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^[+-]\d+$/.test(trimmed)) {
    return { error: 'Use note delta like +2 or -1 when editing Num in delta mode.' };
  }

  return { delta: parseInt(trimmed, 10) };
};

const parsePitchBendInput = (raw: string): { value: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) {
    return { error: `Pitch bend value must be an integer between ${MIDI_PITCH_BEND_MIN_SIGNED} and ${MIDI_PITCH_BEND_MAX_SIGNED}.` };
  }

  const signedValue = parseInt(trimmed, 10);
  if (signedValue < MIDI_PITCH_BEND_MIN_SIGNED || signedValue > MIDI_PITCH_BEND_MAX_SIGNED) {
    return { error: `Pitch bend value must be between ${MIDI_PITCH_BEND_MIN_SIGNED} and ${MIDI_PITCH_BEND_MAX_SIGNED}.` };
  }

  return { value: signedPitchBendToMidiValue(signedValue) };
};

const parsePitchBendDeltaInput = (raw: string): { delta: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^[+-]\d+$/.test(trimmed)) {
    return { error: 'Use pitch bend delta like +256 or -512.' };
  }

  return { delta: parseInt(trimmed, 10) };
};

const formatPitchBendInfo = (value: number): string => {
  const normalized = midiPitchBendToNormalized(value);
  const semitones = normalized * 2;
  return `Raw ${value} | ${normalized.toFixed(3)} | ${semitones.toFixed(2)} st`;
};

const parseControllerNumberInput = (raw: string): { controller: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'Controller number must be an integer between 0 and 127.' };
  }

  const controller = parseInt(trimmed, 10);
  if (controller < 0 || controller > 127) {
    return { error: 'Controller number must be between 0 and 127.' };
  }

  return { controller };
};

const parseControllerValueInput = (raw: string): { value: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { error: 'Controller value must be an integer between 0 and 127.' };
  }

  return { value: clampMidiControllerValue(parseInt(trimmed, 10)) };
};

const parseControllerValueDeltaInput = (raw: string): { delta: number } | { error: string } => {
  const trimmed = raw.trim();
  if (!/^[+-]\d+$/.test(trimmed)) {
    return { error: 'Use controller value delta like +10 or -5.' };
  }

  return { delta: parseInt(trimmed, 10) };
};

const ListEventPanel: React.FC<ListEventPanelProps> = ({ isVisible }) => {
  const {
    tracks,
    activeRegionId,
    selectedRegionIds,
    timeSignature,
    selectedNoteIds,
    selectedPitchBendIds,
    selectedControllerEventIds,
    playheadPosition,
    updateTrack,
    refreshProjectState,
    bumpAutomationRedrawVersion
  } = useProjectStore();

  const [showNotes, setShowNotes] = useState(true);
  const [showPitchBends, setShowPitchBends] = useState(true);
  const [showControllers, setShowControllers] = useState(true);
  const [quantPosition, setQuantPosition] = useState<string>('1/8');
  const [quantLength, setQuantLength] = useState<string>('1/8');
  const [addEventType, setAddEventType] = useState<AddEventType>('note');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const rangeAnchorEventIdRef = useRef<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const pendingSingleClickSelectionRef = useRef<number | null>(null);

  const resolvedRegionId = selectedRegionIds.length > 1
    ? activeRegionId
    : selectedRegionIds.length === 1
      ? selectedRegionIds[0]
      : activeRegionId;

  let activeMidiRegion: KGMidiRegion | null = null;
  let parentTrack = null as typeof tracks[number] | null;

  if (resolvedRegionId) {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === resolvedRegionId);
      if (region instanceof KGMidiRegion) {
        activeMidiRegion = region;
        parentTrack = track;
        break;
      }
    }
  }

  const noteRows: NoteRowData[] = activeMidiRegion
    ? activeMidiRegion.getNotes().map(note => ({
      id: note.getId(),
      type: 'note',
      note,
      absoluteStartBeat: activeMidiRegion!.getStartFromBeat() + note.getStartBeat(),
      durationBeats: note.getEndBeat() - note.getStartBeat(),
    }))
    : [];

  const pitchBendRows: PitchBendRowData[] = activeMidiRegion
    ? activeMidiRegion.getPitchBends().map(pitchBend => ({
      id: pitchBend.getId(),
      type: 'pitch-bend',
      pitchBend,
      absoluteBeat: activeMidiRegion!.getStartFromBeat() + pitchBend.getBeat(),
    }))
    : [];

  const controllerRows: ControllerRowData[] = activeMidiRegion
    ? activeMidiRegion.getAllControllerEventsFlattened().map(({ controller, event }) => ({
      id: event.getId(),
      type: 'controller',
      controller,
      controllerEvent: event,
      absoluteBeat: activeMidiRegion!.getStartFromBeat() + event.getBeat(),
    }))
    : [];

  const eventRows: EventRowData[] = [
    ...(showNotes ? noteRows : []),
    ...(showPitchBends ? pitchBendRows : []),
    ...(showControllers ? controllerRows : []),
  ].sort((a, b) => {
    const beatDelta = (a.type === 'note' ? a.absoluteStartBeat : a.absoluteBeat)
      - (b.type === 'note' ? b.absoluteStartBeat : b.absoluteBeat);
    if (beatDelta !== 0) return beatDelta;
    if (a.type !== b.type) return a.type === 'pitch-bend' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const selectedNoteIdSet = new Set(selectedNoteIds);
  const selectedPitchBendIdSet = new Set(selectedPitchBendIds);
  const selectedControllerEventIdSet = new Set(selectedControllerEventIds);
  const selectedEventIdSet = new Set([...selectedNoteIds, ...selectedPitchBendIds, ...selectedControllerEventIds]);
  const visibleSelectedRows = eventRows.filter(row => selectedEventIdSet.has(row.id));

  useEffect(() => {
    if (editingCell) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingCell?.eventId, editingCell?.column]);

  useEffect(() => {
    return () => {
      if (pendingSingleClickSelectionRef.current !== null) {
        window.clearTimeout(pendingSingleClickSelectionRef.current);
      }
    };
  }, []);

  const commitSelection = (nextSelectedIds: Set<string>) => {
    if (!activeMidiRegion || !parentTrack) return;

    const selectedEvents = eventRows
      .filter(row => nextSelectedIds.has(row.id))
      .map(row => row.type === 'note' ? row.note : row.type === 'pitch-bend' ? row.pitchBend : row.controllerEvent);
    const core = KGCore.instance();
    const previouslySelectedRegionEvents = core.getSelectedItems().filter(item =>
      (item instanceof KGMidiNote && activeMidiRegion.getNotes().some(note => note.getId() === item.getId())) ||
      (item instanceof KGMidiPitchBend && activeMidiRegion.getPitchBends().some(pitchBend => pitchBend.getId() === item.getId())) ||
      (item instanceof KGMidiControllerEvent && activeMidiRegion.getAllControllerEventsFlattened().some(({ event }) => event.getId() === item.getId()))
    );

    activeMidiRegion.getNotes().forEach(note => {
      if (nextSelectedIds.has(note.getId())) note.select();
      else note.deselect();
    });
    activeMidiRegion.getPitchBends().forEach(pitchBend => {
      if (nextSelectedIds.has(pitchBend.getId())) pitchBend.select();
      else pitchBend.deselect();
    });
    activeMidiRegion.getControllerEventsByType().forEach(events => {
      events.forEach(controllerEvent => {
        if (nextSelectedIds.has(controllerEvent.getId())) controllerEvent.select();
        else controllerEvent.deselect();
      });
    });

    if (previouslySelectedRegionEvents.length > 0) {
      core.removeSelectedItems(previouslySelectedRegionEvents);
    }
    if (selectedEvents.length > 0) {
      core.addSelectedItems(selectedEvents);
    }

    void updateTrack(parentTrack);
  };

  const clearPendingSingleClickSelection = () => {
    if (pendingSingleClickSelectionRef.current !== null) {
      window.clearTimeout(pendingSingleClickSelectionRef.current);
      pendingSingleClickSelectionRef.current = null;
    }
  };

  const startEditingCell = (eventId: string, column: EditableColumn, value: string) => {
    clearPendingSingleClickSelection();
    setEditingCell({ eventId, column, value });
  };

  const cancelEditingCell = () => {
    setEditingCell(null);
  };

  const commitEditingCell = async () => {
    if (!editingCell || !activeMidiRegion || !parentTrack) return;

    const row = eventRows.find(candidate => candidate.id === editingCell.eventId);
    if (!row) {
      setEditingCell(null);
      return;
    }

    const trimmedValue = editingCell.value.trim();
    const isDeltaEdit = trimmedValue.startsWith('+') || trimmedValue.startsWith('-');

    if (row.type === 'note') {
      const note = row.note;
      const targetNotes = selectedNoteIdSet.has(note.getId()) && selectedNoteIds.length > 1
        ? activeMidiRegion.getNotes().filter(candidate => selectedNoteIdSet.has(candidate.getId()))
        : [note];

      const snapshots = targetNotes.map(targetNote => ({
        noteId: targetNote.getId(),
        pitch: targetNote.getPitch(),
        velocity: targetNote.getVelocity(),
        startBeat: targetNote.getStartBeat(),
        endBeat: targetNote.getEndBeat()
      }));

      const updates: Array<{ noteId: string; pitch?: number; velocity?: number; startBeat?: number; endBeat?: number }> = [];

      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            const currentDuration = targetNote.getEndBeat() - targetNote.getStartBeat();
            const nextStartBeat = targetNote.getStartBeat() + parsed.deltaBeats;
            if (nextStartBeat < 0) {
              await showAlert('Position delta would move one or more notes before the start of the current MIDI region.');
              return;
            }

            updates.push({
              noteId: targetNote.getId(),
              startBeat: nextStartBeat,
              endBeat: nextStartBeat + currentDuration
            });
          }
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          const relativeStartBeat = parsed.absoluteBeat - activeMidiRegion.getStartFromBeat();
          if (relativeStartBeat < 0) {
            await showAlert('Position cannot be earlier than the start of the current MIDI region.');
            return;
          }

          for (const targetNote of targetNotes) {
            const currentDuration = targetNote.getEndBeat() - targetNote.getStartBeat();
            updates.push({
              noteId: targetNote.getId(),
              startBeat: relativeStartBeat,
              endBeat: relativeStartBeat + currentDuration
            });
          }
        }
      }

      if (editingCell.column === 'num') {
        if (isDeltaEdit) {
          const parsed = parsePitchDeltaInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            const nextPitch = targetNote.getPitch() + parsed.delta;
            if (nextPitch < 0 || nextPitch > 127) {
              await showAlert('Num delta would move one or more notes outside the MIDI pitch range 0–127.');
              return;
            }
            updates.push({ noteId: targetNote.getId(), pitch: nextPitch });
          }
        } else {
          const parsed = parseNoteNameInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            updates.push({ noteId: targetNote.getId(), pitch: parsed.pitch });
          }
        }
      }

      if (editingCell.column === 'val') {
        if (isDeltaEdit) {
          const parsed = parseVelocityDeltaInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            const nextVelocity = targetNote.getVelocity() + parsed.delta;
            if (nextVelocity < 0 || nextVelocity > 127) {
              await showAlert('Velocity delta would move one or more notes outside the valid range 0–127.');
              return;
            }
            updates.push({ noteId: targetNote.getId(), velocity: nextVelocity });
          }
        } else {
          const parsed = parseVelocityInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            updates.push({ noteId: targetNote.getId(), velocity: parsed.velocity });
          }
        }
      }

      if (editingCell.column === 'length') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventLengthDelta(trimmedValue, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            const currentDuration = targetNote.getEndBeat() - targetNote.getStartBeat();
            const nextDuration = currentDuration + parsed.deltaBeats;
            if (nextDuration <= 0) {
              await showAlert('Length delta would make one or more notes non-positive in duration.');
              return;
            }

            updates.push({
              noteId: targetNote.getId(),
              endBeat: targetNote.getStartBeat() + nextDuration
            });
          }
        } else {
          const parsed = parseMidiEventLength(trimmedValue, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetNote of targetNotes) {
            updates.push({
              noteId: targetNote.getId(),
              endBeat: targetNote.getStartBeat() + parsed.duration
            });
          }
        }
      }

      if (updates.length === 0) {
        setEditingCell(null);
        return;
      }

      KGCore.instance().executeCommand(new UpdateNotePropertiesCommand(activeMidiRegion.getId(), snapshots, updates));
    } else if (row.type === 'pitch-bend') {
      const pitchBend = row.pitchBend;
      const targetPitchBends = selectedPitchBendIdSet.has(pitchBend.getId()) && selectedPitchBendIds.length > 1
        ? activeMidiRegion.getPitchBends().filter(candidate => selectedPitchBendIdSet.has(candidate.getId()))
        : [pitchBend];

      const snapshots = targetPitchBends.map(targetPitchBend => ({
        pitchBendId: targetPitchBend.getId(),
        beat: targetPitchBend.getBeat(),
        value: targetPitchBend.getValue(),
      }));
      const updates: Array<{ pitchBendId: string; beat?: number; value?: number }> = [];

      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetPitchBend of targetPitchBends) {
            const nextBeat = targetPitchBend.getBeat() + parsed.deltaBeats;
            if (nextBeat < 0) {
              await showAlert('Position delta would move one or more pitch bends before the start of the current MIDI region.');
              return;
            }
            updates.push({ pitchBendId: targetPitchBend.getId(), beat: nextBeat });
          }
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          const relativeBeat = parsed.absoluteBeat - activeMidiRegion.getStartFromBeat();
          if (relativeBeat < 0) {
            await showAlert('Position cannot be earlier than the start of the current MIDI region.');
            return;
          }

          for (const targetPitchBend of targetPitchBends) {
            updates.push({ pitchBendId: targetPitchBend.getId(), beat: relativeBeat });
          }
        }
      }

      if (editingCell.column === 'val') {
        if (isDeltaEdit) {
          const parsed = parsePitchBendDeltaInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetPitchBend of targetPitchBends) {
            const nextSignedValue = midiPitchBendToSignedValue(targetPitchBend.getValue()) + parsed.delta;
            if (nextSignedValue < MIDI_PITCH_BEND_MIN_SIGNED || nextSignedValue > MIDI_PITCH_BEND_MAX_SIGNED) {
              await showAlert(`Pitch bend delta would move one or more events outside the valid range ${MIDI_PITCH_BEND_MIN_SIGNED}–${MIDI_PITCH_BEND_MAX_SIGNED}.`);
              return;
            }
            updates.push({
              pitchBendId: targetPitchBend.getId(),
              value: signedPitchBendToMidiValue(nextSignedValue),
            });
          }
        } else {
          const parsed = parsePitchBendInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetPitchBend of targetPitchBends) {
            updates.push({ pitchBendId: targetPitchBend.getId(), value: clampMidiPitchBendValue(parsed.value) });
          }
        }
      }

      if (updates.length === 0) {
        setEditingCell(null);
        return;
      }

      KGCore.instance().executeCommand(new UpdatePitchBendPropertiesCommand(activeMidiRegion.getId(), snapshots, updates));
      bumpAutomationRedrawVersion();
    } else {
      const controllerEvent = row.controllerEvent;
      const targetControllerEvents = selectedControllerEventIdSet.has(controllerEvent.getId()) && selectedControllerEventIds.length > 1
        ? activeMidiRegion.getAllControllerEventsFlattened()
          .filter(candidate => selectedControllerEventIdSet.has(candidate.event.getId()))
        : [{ controller: row.controller, event: controllerEvent }];

      const snapshots = targetControllerEvents.map(({ controller, event }) => ({
        controllerEventId: event.getId(),
        controller,
        beat: event.getBeat(),
        value: event.getValue(),
      }));
      const updates: Array<{ controllerEventId: string; controller?: number; beat?: number; value?: number }> = [];

      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const { event } of targetControllerEvents) {
            const nextBeat = event.getBeat() + parsed.deltaBeats;
            if (nextBeat < 0) {
              await showAlert('Position delta would move one or more controller events before the start of the current MIDI region.');
              return;
            }
            updates.push({ controllerEventId: event.getId(), beat: nextBeat });
          }
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          const relativeBeat = parsed.absoluteBeat - activeMidiRegion.getStartFromBeat();
          if (relativeBeat < 0) {
            await showAlert('Position cannot be earlier than the start of the current MIDI region.');
            return;
          }

          for (const { event } of targetControllerEvents) {
            updates.push({ controllerEventId: event.getId(), beat: relativeBeat });
          }
        }
      }

      if (editingCell.column === 'num') {
        const parsed = parseControllerNumberInput(trimmedValue);
        if ('error' in parsed) {
          await showAlert(parsed.error);
          return;
        }

        for (const { event } of targetControllerEvents) {
          updates.push({ controllerEventId: event.getId(), controller: parsed.controller });
        }
      }

      if (editingCell.column === 'val') {
        if (isDeltaEdit) {
          const parsed = parseControllerValueDeltaInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const { event } of targetControllerEvents) {
            const nextValue = event.getValue() + parsed.delta;
            if (nextValue < 0 || nextValue > 127) {
              await showAlert('Controller delta would move one or more events outside the valid range 0–127.');
              return;
            }
            updates.push({ controllerEventId: event.getId(), value: clampMidiControllerValue(nextValue) });
          }
        } else {
          const parsed = parseControllerValueInput(trimmedValue);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const { event } of targetControllerEvents) {
            updates.push({ controllerEventId: event.getId(), value: parsed.value });
          }
        }
      }

      if (updates.length === 0) {
        setEditingCell(null);
        return;
      }

      KGCore.instance().executeCommand(new UpdateControllerEventPropertiesCommand(activeMidiRegion.getId(), snapshots, updates));
      bumpAutomationRedrawVersion();
    }

    await updateTrack(parentTrack);
    refreshProjectState();
    setEditingCell(null);
  };

  const handleRowClick = (eventId: string, rowIndex: number, event: React.MouseEvent<HTMLTableRowElement>) => {
    event.stopPropagation();
    if (editingCell) return;

    const isModifierPressed = isModifierKeyPressed(event);
    const nextSelectedIds = new Set(selectedEventIdSet);
    const isAlreadySelected = selectedEventIdSet.has(eventId);
    const hasMultiSelection = selectedEventIdSet.size > 1;

    if (event.shiftKey) {
      clearPendingSingleClickSelection();
      const anchorIndex = eventRows.findIndex(row => row.id === rangeAnchorEventIdRef.current);
      const rangeStartIndex = anchorIndex >= 0 ? Math.min(anchorIndex, rowIndex) : rowIndex;
      const rangeEndIndex = anchorIndex >= 0 ? Math.max(anchorIndex, rowIndex) : rowIndex;

      if (!isModifierPressed) {
        nextSelectedIds.clear();
      }

      for (let index = rangeStartIndex; index <= rangeEndIndex; index += 1) {
        nextSelectedIds.add(eventRows[index].id);
      }
    } else if (isModifierPressed) {
      clearPendingSingleClickSelection();
      if (nextSelectedIds.has(eventId)) {
        nextSelectedIds.delete(eventId);
      } else {
        nextSelectedIds.add(eventId);
      }
      rangeAnchorEventIdRef.current = eventId;
    } else {
      if (isAlreadySelected && hasMultiSelection) {
        clearPendingSingleClickSelection();
        pendingSingleClickSelectionRef.current = window.setTimeout(() => {
          const delayedSelection = new Set<string>([eventId]);
          rangeAnchorEventIdRef.current = eventId;
          commitSelection(delayedSelection);
          pendingSingleClickSelectionRef.current = null;
        }, 220);
        return;
      }

      clearPendingSingleClickSelection();
      nextSelectedIds.clear();
      nextSelectedIds.add(eventId);
      rangeAnchorEventIdRef.current = eventId;
    }

    if (event.shiftKey && rangeAnchorEventIdRef.current === null) {
      rangeAnchorEventIdRef.current = eventId;
    }

    commitSelection(nextSelectedIds);
  };

  const handleTableBackgroundMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.target !== event.currentTarget) return;
    clearPendingSingleClickSelection();
    rangeAnchorEventIdRef.current = null;
    commitSelection(new Set());
  };

  const handleTableShellClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleEditInputKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      await commitEditingCell();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      suppressBlurCommitRef.current = true;
      cancelEditingCell();
    }
  };

  const handleEditInputBlur = () => {
    if (suppressBlurCommitRef.current) {
      suppressBlurCommitRef.current = false;
      return;
    }

    void commitEditingCell();
  };

  const quantizeSelectedNotes = (quantValue: string) => {
    if (!activeMidiRegion || !parentTrack) return;

    const denominator = parseInt(quantValue.split('/')[1], 10);
    if (Number.isNaN(denominator)) return;

    const selectedNotes = activeMidiRegion
      .getNotes()
      .filter(note => selectedNoteIdSet.has(note.getId()));

    if (selectedNotes.length === 0) return;

    const quantizationStep = 4 / denominator;
    selectedNotes.forEach(note => {
      const currentStartBeat = note.getStartBeat();
      const duration = note.getEndBeat() - currentStartBeat;
      const quantizedStartBeat = Math.round(currentStartBeat / quantizationStep) * quantizationStep;
      note.setStartBeat(quantizedStartBeat);
      note.setEndBeat(quantizedStartBeat + duration);
    });

    void updateTrack(parentTrack);
    refreshProjectState();
  };

  const quantizeSelectedNoteLengths = (quantValue: string) => {
    if (!activeMidiRegion || !parentTrack) return;

    const denominator = parseInt(quantValue.split('/')[1], 10);
    if (Number.isNaN(denominator)) return;

    const selectedNotes = activeMidiRegion
      .getNotes()
      .filter(note => selectedNoteIdSet.has(note.getId()));

    if (selectedNotes.length === 0) return;

    const quantizationStep = 4 / denominator;
    selectedNotes.forEach(note => {
      const startBeat = note.getStartBeat();
      const currentDuration = note.getEndBeat() - startBeat;
      let quantizedDuration = currentDuration < quantizationStep
        ? quantizationStep
        : Math.round(currentDuration / quantizationStep) * quantizationStep;

      quantizedDuration = Math.max(PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH, quantizedDuration);
      note.setEndBeat(startBeat + quantizedDuration);
    });

    void updateTrack(parentTrack);
    refreshProjectState();
  };

  const handleAddEvent = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!activeMidiRegion || !parentTrack) return;

    const regionRelativePlayhead = Math.max(0, playheadPosition - activeMidiRegion.getStartFromBeat());

    if (addEventType === 'note') {
      const lastSelectedNoteId = [...selectedNoteIds]
        .reverse()
        .find(noteId => activeMidiRegion.getNotes().some(note => note.getId() === noteId));
      const lastSelectedNote = lastSelectedNoteId
        ? activeMidiRegion.getNotes().find(note => note.getId() === lastSelectedNoteId) ?? null
        : null;

      const defaultLength = lastSelectedNote
        ? lastSelectedNote.getEndBeat() - lastSelectedNote.getStartBeat()
        : KGPianoRollState.instance().getLastEditedNoteLength();
      const defaultPitch = lastSelectedNote ? lastSelectedNote.getPitch() : noteNameToPitch('C4');
      const defaultVelocity = lastSelectedNote ? lastSelectedNote.getVelocity() : 127;

      const command = new CreateNoteCommand(
        activeMidiRegion.getId(),
        regionRelativePlayhead,
        regionRelativePlayhead + defaultLength,
        defaultPitch,
        defaultVelocity
      );

      KGCore.instance().executeCommand(command);
      KGPianoRollState.instance().setLastEditedNoteLength(defaultLength);
      const createdNote = command.getCreatedNote();
      if (createdNote) {
        createdNote.select();
        KGCore.instance().clearSelectedItems();
        KGCore.instance().addSelectedItem(createdNote);
        rangeAnchorEventIdRef.current = createdNote.getId();
      }
    } else if (addEventType === 'pitch-bend') {
      const command = new CreateMidiEventsCommand([], [{
        regionId: activeMidiRegion.getId(),
        beat: regionRelativePlayhead,
        value: MIDI_PITCH_BEND_CENTER,
      }]);

      KGCore.instance().executeCommand(command);
      bumpAutomationRedrawVersion();
      const createdPitchBend = command.getCreatedPitchBends()[0]?.pitchBend;
      if (createdPitchBend) {
        createdPitchBend.select();
        KGCore.instance().clearSelectedItems();
        KGCore.instance().addSelectedItem(createdPitchBend);
        rangeAnchorEventIdRef.current = createdPitchBend.getId();
      }
    } else {
      const lastSelectedController = [...selectedControllerEventIds]
        .reverse()
        .map(id => activeMidiRegion.getAllControllerEventsFlattened().find(candidate => candidate.event.getId() === id))
        .find(Boolean)?.controller ?? 11;
      const command = new CreateMidiEventsCommand([], [], [{
        regionId: activeMidiRegion.getId(),
        controller: lastSelectedController,
        beat: regionRelativePlayhead,
        value: 127,
      }]);

      KGCore.instance().executeCommand(command);
      bumpAutomationRedrawVersion();
      const createdControllerEvent = command.getCreatedControllerEvents()[0]?.controllerEvent;
      if (createdControllerEvent) {
        createdControllerEvent.select();
        KGCore.instance().clearSelectedItems();
        KGCore.instance().addSelectedItem(createdControllerEvent);
        rangeAnchorEventIdRef.current = createdControllerEvent.getId();
      }
    }

    await updateTrack(parentTrack);
    refreshProjectState();
  };

  const handleDeleteSelectedRows = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!activeMidiRegion || !parentTrack || visibleSelectedRows.length === 0) return;

    const noteIds = visibleSelectedRows
      .filter((row): row is NoteRowData => row.type === 'note')
      .map(row => row.note.getId());
    const pitchBendIds = visibleSelectedRows
      .filter((row): row is PitchBendRowData => row.type === 'pitch-bend')
      .map(row => row.pitchBend.getId());
    const controllerEventIds = visibleSelectedRows
      .filter((row): row is ControllerRowData => row.type === 'controller')
      .map(row => row.controllerEvent.getId());

    KGCore.instance().executeCommand(new DeleteMidiEventsCommand(noteIds, pitchBendIds, controllerEventIds));
    if (pitchBendIds.length > 0 || controllerEventIds.length > 0) {
      bumpAutomationRedrawVersion();
    }
    rangeAnchorEventIdRef.current = null;
    await updateTrack(parentTrack);
    refreshProjectState();
  };

  return (
    <div className={`list-event-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="list-event-panel-header">
        <h3>List Event</h3>
      </div>

      <div className="list-event-panel-body">
        <div className="list-event-tabs" role="tablist" aria-label="Event types">
          <button
            className={`list-event-tab${showNotes ? ' active' : ''}`}
            aria-pressed={showNotes}
            type="button"
            onClick={() => setShowNotes(value => !value)}
          >
            Notes
          </button>
          <button
            className={`list-event-tab${showPitchBends ? ' active' : ''}`}
            aria-pressed={showPitchBends}
            type="button"
            onClick={() => setShowPitchBends(value => !value)}
          >
            Pitch Bends
          </button>
          <button
            className={`list-event-tab${showControllers ? ' active' : ''}`}
            aria-pressed={showControllers}
            type="button"
            onClick={() => setShowControllers(value => !value)}
          >
            Controller
          </button>
        </div>

        {!activeMidiRegion ? (
          <div className="list-event-empty-state">
            Please select a MIDI region, or open one in the Piano Roll, to view its event list.
          </div>
        ) : (
          <>
            <div className="list-event-toolbar">
              <div className="list-event-toolbar-group">
                <button
                  className="list-event-add-button"
                  title={
                    addEventType === 'note'
                      ? 'Add note at playhead'
                      : addEventType === 'pitch-bend'
                        ? 'Add pitch bend at playhead'
                        : 'Add controller event at playhead'
                  }
                  type="button"
                  onClick={handleAddEvent}
                >
                  <FaPlus />
                </button>
                <KGDropdown
                  options={[...ADD_EVENT_TYPE_OPTIONS]}
                  value={addEventType}
                  onChange={(value) => setAddEventType(value as AddEventType)}
                  label="Note"
                  buttonClassName="list-event-type-button"
                  showValueAsLabel
                />
              </div>

              <div className="list-event-toolbar-group list-event-toolbar-group-right">
                <KGDropdown
                  options={KGPianoRollState.QUANT_POS_OPTIONS}
                  value={quantPosition}
                  onChange={(value) => {
                    setQuantPosition(value);
                    quantizeSelectedNotes(value);
                  }}
                  label="Qua. Pos."
                  buttonClassName="list-event-quant-button"
                />
                <KGDropdown
                  options={KGPianoRollState.QUANT_LEN_OPTIONS}
                  value={quantLength}
                  onChange={(value) => {
                    setQuantLength(value);
                    quantizeSelectedNoteLengths(value);
                  }}
                  label="Qua. Len."
                  buttonClassName="list-event-quant-button"
                />
                <button
                  className="list-event-delete-button"
                  title="Delete visible selected rows"
                  type="button"
                  onClick={handleDeleteSelectedRows}
                  disabled={visibleSelectedRows.length === 0}
                >
                  <FaTrash />
                </button>
              </div>
            </div>

            <div
              className="list-event-table-shell"
              onMouseDown={handleTableBackgroundMouseDown}
              onClick={handleTableShellClick}
              onDoubleClick={handleTableShellClick}
            >
              <table className="list-event-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Status</th>
                    <th>Num</th>
                    <th>Val</th>
                    <th>Length/Info</th>
                  </tr>
                </thead>
                <tbody>
                  {eventRows.map((row, index) => {
                    const absoluteBeat = row.type === 'note' ? row.absoluteStartBeat : row.absoluteBeat;
                    const positionText = formatMidiEventPosition(absoluteBeat, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
                    const statusText = row.type === 'note' ? 'Note' : row.type === 'pitch-bend' ? 'Pitch Bend' : 'Controller';
                    const numText = row.type === 'note'
                      ? pitchToNoteNameString(row.note.getPitch())
                      : row.type === 'controller'
                        ? String(row.controller)
                        : '';
                    const valText = row.type === 'note'
                      ? String(row.note.getVelocity())
                      : row.type === 'pitch-bend'
                        ? String(midiPitchBendToSignedValue(row.pitchBend.getValue()))
                        : String(row.controllerEvent.getValue());
                    const lengthText = row.type === 'note'
                      ? formatMidiEventLength(row.durationBeats, MIDI_EVENT_TICKS_PER_BEAT)
                      : row.type === 'pitch-bend'
                        ? formatPitchBendInfo(row.pitchBend.getValue())
                        : `Raw ${row.controllerEvent.getValue()}`;
                    const isEditingPosition = editingCell?.eventId === row.id && editingCell.column === 'position';
                    const isEditingNum = editingCell?.eventId === row.id && editingCell.column === 'num';
                    const isEditingVal = editingCell?.eventId === row.id && editingCell.column === 'val';
                    const isEditingLength = editingCell?.eventId === row.id && editingCell.column === 'length';

                    return (
                      <tr
                        key={row.id}
                        className={selectedEventIdSet.has(row.id) ? 'selected' : ''}
                        onClick={(event) => handleRowClick(row.id, index, event)}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          clearPendingSingleClickSelection();
                        }}
                      >
                        <td
                          title={positionText}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            startEditingCell(row.id, 'position', positionText);
                          }}
                        >
                          {isEditingPosition ? (
                            <input
                              ref={editInputRef}
                              className="list-event-cell-input"
                              value={editingCell.value}
                              onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={handleEditInputBlur}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                            />
                          ) : positionText}
                        </td>
                        <td title={statusText}>{statusText}</td>
                        <td
                          title={numText}
                          onDoubleClick={(event) => {
                            if (row.type === 'pitch-bend') return;
                            event.stopPropagation();
                            startEditingCell(row.id, 'num', numText);
                          }}
                        >
                          {isEditingNum ? (
                            <input
                              ref={editInputRef}
                              className="list-event-cell-input"
                              value={editingCell.value}
                              onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={handleEditInputBlur}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                            />
                          ) : numText}
                        </td>
                        <td
                          title={valText}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            startEditingCell(row.id, 'val', valText);
                          }}
                        >
                          {isEditingVal ? (
                            <input
                              ref={editInputRef}
                              className="list-event-cell-input"
                              value={editingCell.value}
                              onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={handleEditInputBlur}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                            />
                          ) : valText}
                        </td>
                        <td
                          title={lengthText}
                          onDoubleClick={(event) => {
                            if (row.type !== 'note') return;
                            event.stopPropagation();
                            startEditingCell(row.id, 'length', lengthText);
                          }}
                        >
                          {isEditingLength ? (
                            <input
                              ref={editInputRef}
                              className="list-event-cell-input"
                              value={editingCell.value}
                              onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                              onBlur={handleEditInputBlur}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                            />
                          ) : lengthText}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ListEventPanel;
