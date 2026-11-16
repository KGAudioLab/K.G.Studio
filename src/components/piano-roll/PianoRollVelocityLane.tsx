import { useEffect, useState, type PointerEvent } from 'react';
import { PIANO_ROLL_CONSTANTS } from '../../constants';
import { MIDI_VELOCITY } from '../../constants/midiConstants';
import { KGCore } from '../../core/KGCore';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import { KGMidiPitchBend } from '../../core/midi/KGMidiPitchBend';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { ticksToPixels } from '../../core/timing';
import { useProjectStore } from '../../stores/projectStore';
import { createNoteVelocityCommand, getAutomationLaneScale } from './pianoRollAutomationEditing';
import PianoRollAutomationPencil from './PianoRollAutomationPencil';

interface PianoRollVelocityLaneProps {
  activeRegion: KGMidiRegion | null;
  beatWidth: number;
  laneHeight: number;
  pencilEnabled: boolean;
  horizontalScrollLeft: number;
}

interface Point {
  x: number;
  y: number;
}

type Gesture = {
  pointerId: number;
  start: Point;
  end: Point;
} & ({ kind: 'note'; noteId: string; velocity: number } | { kind: 'ramp' });

function getPointerPosition(event: PointerEvent<SVGSVGElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export default function PianoRollVelocityLane({
  activeRegion,
  beatWidth,
  laneHeight,
  pencilEnabled,
  horizontalScrollLeft,
}: PianoRollVelocityLaneProps) {
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const { refreshProjectState, selectedNoteIds } = useProjectStore();
  const notes = activeRegion?.getNotes() ?? [];
  const regionStartTick = activeRegion?.getStartTick() ?? 0;
  const keyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')) || 60;
  const scale = getAutomationLaneScale(laneHeight, MIDI_VELOCITY.MAX);
  const { toY } = scale;

  useEffect(() => {
    const core = KGCore.instance();
    const hiddenEvents = core.getSelectedItems().filter(item => (
      item instanceof KGMidiPitchBend || item instanceof KGMidiControllerEvent
    ));
    if (hiddenEvents.length > 0) {
      hiddenEvents.forEach(event => event.deselect());
      core.removeSelectedItems(hiddenEvents);
    }
  }, [activeRegion]);

  const toX = (relativeTick: number) => keyWidth + ticksToPixels(regionStartTick + relativeTick, beatWidth);
  const toVelocity = (y: number) => Math.round(scale.toValue(y));

  const dragNote = gesture?.kind === 'note' ? gesture : null;
  const ramp = gesture?.kind === 'ramp' ? gesture : null;
  const selectedIds = new Set(selectedNoteIds);
  const points = notes.map(note => {
    const noteId = note.getId();
    const velocity = dragNote?.noteId === noteId
      ? toVelocity(toY(dragNote.velocity) + dragNote.end.y - dragNote.start.y)
      : note.getVelocity();
    return {
      noteId,
      startX: toX(note.getStartTick()),
      endX: toX(note.getEndTick()),
      y: toY(velocity),
      velocity,
      isSelected: selectedIds.has(noteId) || dragNote?.noteId === noteId,
    };
  });
  // Keep the selected note's dot reachable when chord notes share a velocity.
  points.sort((left, right) => Number(left.isSelected) - Number(right.isSelected));

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture || notes.length === 0) return;

    const start = getPointerPosition(event);
    const noteId = (event.target as Element).closest('circle[data-note-id]')?.getAttribute('data-note-id');
    const note = notes.find(candidate => candidate.getId() === noteId);
    event.currentTarget.setPointerCapture(event.pointerId);
    const base = { pointerId: event.pointerId, start, end: start };
    setGesture(note
      ? { ...base, kind: 'note', noteId: note.getId(), velocity: note.getVelocity() }
      : { ...base, kind: 'ramp' });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture?.pointerId === event.pointerId) {
      setGesture({ ...gesture, end: getPointerPosition(event) });
    }
  };

  const cancelGesture = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture?.pointerId === event.pointerId) setGesture(null);
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture?.pointerId !== event.pointerId || !activeRegion) return;
    setGesture(null);

    const end = getPointerPosition(event);
    const dx = end.x - gesture.start.x;
    const dy = end.y - gesture.start.y;
    if (gesture.kind === 'ramp' && Math.abs(dx) < PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD) return;
    if (gesture.kind === 'note' && dy === 0) return;

    const command = createNoteVelocityCommand(activeRegion, note => {
      if (gesture.kind === 'note') {
        return note.getId() === gesture.noteId ? toVelocity(toY(gesture.velocity) + dy) : undefined;
      }

      const fraction = (toX(note.getStartTick()) - gesture.start.x) / dx;
      if (fraction < 0 || fraction > 1) return undefined;
      return toVelocity(gesture.start.y + dy * fraction);
    });

    if (command) {
      KGCore.instance().executeCommand(command);
      refreshProjectState();
    }
  };

  return (
    <div className="piano-roll-automation-scroll-layer" style={{ transform: `translateX(-${horizontalScrollLeft}px)` }}>
      <div className="piano-roll-automation-grid" />
      <svg
        className="piano-roll-automation-svg piano-roll-velocity-svg"
        width="100%"
        height={laneHeight}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
      >
        {points.map(point => (
          <line
            key={point.noteId}
            className={`piano-roll-automation-line${point.isSelected ? ' selected' : ''}`}
            x1={point.startX}
            x2={point.endX}
            y1={point.y}
            y2={point.y}
            stroke="currentColor"
            strokeWidth="2"
          />
        ))}
        {points.map(point => (
          <circle
            key={point.noteId}
            className={`piano-roll-automation-point${point.isSelected ? ' selected' : ''}`}
            data-note-id={point.noteId}
            cx={point.startX}
            cy={point.y}
            r="5"
            fill="currentColor"
            stroke="#1d2428"
            strokeWidth="1.5"
          >
            <title>{point.velocity}</title>
          </circle>
        ))}
        {ramp && (
          <line
            className="piano-roll-velocity-ramp"
            x1={ramp.start.x}
            y1={ramp.start.y}
            x2={ramp.end.x}
            y2={ramp.end.y}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )}
      </svg>
      {pencilEnabled && activeRegion && (
        <PianoRollAutomationPencil
          region={activeRegion}
          automationType="velocity"
          beatWidth={beatWidth}
          laneHeight={laneHeight}
        />
      )}
    </div>
  );
}
