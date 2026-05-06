import React, { useRef, useState } from 'react';
import './ListEventPanel.css';
import { FaPlus } from 'react-icons/fa';
import KGDropdown from './common/KGDropdown';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { beatsToBar, pitchToNoteNameString } from '../util/midiUtil';
import { isModifierKeyPressed } from '../util/osUtil';
import { PIANO_ROLL_CONSTANTS } from '../constants';

interface ListEventPanelProps {
  isVisible: boolean;
}

interface NoteRowData {
  id: string;
  note: KGMidiNote;
  absoluteStartBeat: number;
  durationBeats: number;
}

const EVENT_TYPE_OPTIONS = [{ label: 'Notes', value: 'notes' }];
const EVENT_POSITION_TICKS_PER_BEAT = 480;

const formatEventPosition = (
  beats: number,
  timeSignature: { numerator: number; denominator: number }
): string => {
  const { bar, beatInBar } = beatsToBar(beats, timeSignature);
  const beatInteger = Math.floor(beatInBar);
  let tick = Math.round((beatInBar - beatInteger) * EVENT_POSITION_TICKS_PER_BEAT);
  let normalizedBeat = beatInteger;
  let normalizedBar = bar;

  if (tick >= EVENT_POSITION_TICKS_PER_BEAT) {
    tick = 0;
    normalizedBeat += 1;
  }

  if (normalizedBeat >= timeSignature.numerator) {
    normalizedBeat = 0;
    normalizedBar += 1;
  }

  return `${normalizedBar + 1} ${normalizedBeat + 1} ${tick}`;
};

const formatEventLength = (
  beats: number
): string => {
  const fullBeats = Math.floor(beats);
  let tick = Math.round((beats - fullBeats) * EVENT_POSITION_TICKS_PER_BEAT);
  let normalizedBeats = fullBeats;

  if (tick >= EVENT_POSITION_TICKS_PER_BEAT) {
    tick = 0;
    normalizedBeats += 1;
  }

  return `${normalizedBeats} ${tick}`;
};

const ListEventPanel: React.FC<ListEventPanelProps> = ({ isVisible }) => {
  const {
    tracks,
    activeRegionId,
    selectedRegionIds,
    timeSignature,
    selectedNoteIds,
    updateTrack,
    refreshProjectState
  } = useProjectStore();

  const [eventType, setEventType] = useState('notes');
  const [quantPosition, setQuantPosition] = useState<string>('1/8');
  const [quantLength, setQuantLength] = useState<string>('1/8');
  const rangeAnchorNoteIdRef = useRef<string | null>(null);

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
    ? [...activeMidiRegion.getNotes()]
      .sort((a, b) => {
        if (a.getStartBeat() !== b.getStartBeat()) return a.getStartBeat() - b.getStartBeat();
        if (a.getPitch() !== b.getPitch()) return a.getPitch() - b.getPitch();
        return a.getId().localeCompare(b.getId());
      })
      .map(note => ({
        id: note.getId(),
        note,
        absoluteStartBeat: activeMidiRegion!.getStartFromBeat() + note.getStartBeat(),
        durationBeats: note.getEndBeat() - note.getStartBeat()
      }))
    : [];

  const selectedNoteIdSet = new Set(selectedNoteIds);

  const commitSelection = (nextSelectedIds: Set<string>) => {
    if (!activeMidiRegion || !parentTrack) return;

    const selectedNotes = activeMidiRegion.getNotes().filter(note => nextSelectedIds.has(note.getId()));
    const core = KGCore.instance();

    activeMidiRegion.getNotes().forEach(note => {
      if (nextSelectedIds.has(note.getId())) {
        note.select();
      } else {
        note.deselect();
      }
    });

    core.clearSelectedItems();
    if (selectedNotes.length > 0) {
      core.addSelectedItems(selectedNotes);
    }

    void updateTrack(parentTrack);
  };

  const handleRowClick = (noteId: string, rowIndex: number, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (!activeMidiRegion) return;

    const isModifierPressed = isModifierKeyPressed(event);
    const nextSelectedIds = new Set(selectedNoteIdSet);

    if (event.shiftKey) {
      const anchorIndex = noteRows.findIndex(row => row.id === rangeAnchorNoteIdRef.current);
      const rangeStartIndex = anchorIndex >= 0 ? Math.min(anchorIndex, rowIndex) : rowIndex;
      const rangeEndIndex = anchorIndex >= 0 ? Math.max(anchorIndex, rowIndex) : rowIndex;

      if (!isModifierPressed) {
        nextSelectedIds.clear();
      }

      for (let index = rangeStartIndex; index <= rangeEndIndex; index += 1) {
        nextSelectedIds.add(noteRows[index].id);
      }
    } else if (isModifierPressed) {
      if (nextSelectedIds.has(noteId)) {
        nextSelectedIds.delete(noteId);
      } else {
        nextSelectedIds.add(noteId);
      }
      rangeAnchorNoteIdRef.current = noteId;
    } else {
      nextSelectedIds.clear();
      nextSelectedIds.add(noteId);
      rangeAnchorNoteIdRef.current = noteId;
    }

    if (event.shiftKey && rangeAnchorNoteIdRef.current === null) {
      rangeAnchorNoteIdRef.current = noteId;
    }

    commitSelection(nextSelectedIds);
  };

  const handleTableBackgroundMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    rangeAnchorNoteIdRef.current = null;
    commitSelection(new Set());
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

  return (
    <div className={`list-event-panel${isVisible ? '' : ' is-hidden'}`}>
      <div className="list-event-panel-header">
        <h3>List Event</h3>
      </div>

      <div className="list-event-panel-body">
        <div className="list-event-tabs" role="tablist" aria-label="Event types">
          <button className="list-event-tab active" aria-pressed="true">Notes</button>
          <button className="list-event-tab" aria-pressed="false">Pitch Bends</button>
          <button className="list-event-tab" aria-pressed="false">Controller</button>
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
                  title="Add note UI only for now"
                  type="button"
                >
                  <FaPlus />
                </button>
                <KGDropdown
                  options={EVENT_TYPE_OPTIONS}
                  value={eventType}
                  onChange={setEventType}
                  label="Event Type"
                  buttonClassName="list-event-dropdown-button"
                  showValueAsLabel={true}
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
              </div>
            </div>

            <div className="list-event-table-shell" onMouseDown={handleTableBackgroundMouseDown}>
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
                  {noteRows.map((row, index) => (
                    (() => {
                      const positionText = formatEventPosition(row.absoluteStartBeat, timeSignature);
                      const statusText = 'Note';
                      const noteText = pitchToNoteNameString(row.note.getPitch());
                      const velocityText = String(row.note.getVelocity());
                      const lengthText = formatEventLength(row.durationBeats);

                      return (
                        <tr
                          key={row.id}
                          className={selectedNoteIdSet.has(row.id) ? 'selected' : ''}
                          onClick={(event) => handleRowClick(row.id, index, event)}
                        >
                          <td title={positionText}>{positionText}</td>
                          <td title={statusText}>{statusText}</td>
                          <td title={noteText}>{noteText}</td>
                          <td title={velocityText}>{velocityText}</td>
                          <td title={lengthText}>{lengthText}</td>
                        </tr>
                      );
                    })()
                  ))}
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
