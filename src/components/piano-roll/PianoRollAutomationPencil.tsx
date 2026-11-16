import { useRef, useState, type PointerEvent } from 'react';
import { PIANO_ROLL_CONSTANTS } from '../../constants';
import { KGCore } from '../../core/KGCore';
import { ReplaceMidiAutomationCommand } from '../../core/commands/note/ReplaceMidiAutomationCommand';
import type { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { pixelsToTicks, ticksToPixels } from '../../core/timing';
import { useProjectStore } from '../../stores/projectStore';
import { resolveSortedMidiAutomationValueAtTick, type MidiAutomationPoint } from '../../util/midiAutomationUtil';
import { clampMidiControllerValue, clampMidiPitchBendValue, MIDI_CONTROLLER_MAX, MIDI_PITCH_BEND_MAX } from '../../util/midiUtil';
import { getControllerNumberForAutomationType, type PianoRollAutomationType } from './pianoRollAutomation';
import { createNoteVelocityCommand, getAutomationLaneScale, simplifyAutomationStroke } from './pianoRollAutomationEditing';

interface PianoRollAutomationPencilProps {
  region: KGMidiRegion;
  automationType: PianoRollAutomationType;
  beatWidth: number;
  laneHeight: number;
  onClick?: (clientX: number, clientY: number) => void;
}

interface PencilStroke {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  dragged: boolean;
  samples: MidiAutomationPoint[];
}

export default function PianoRollAutomationPencil({
  region,
  automationType,
  beatWidth,
  laneHeight,
  onClick,
}: PianoRollAutomationPencilProps) {
  const strokeRef = useRef<PencilStroke | null>(null);
  const [preview, setPreview] = useState('');
  const refreshProjectState = useProjectStore(state => state.refreshProjectState);
  const { toY, toValue } = getAutomationLaneScale(laneHeight);

  const addSample = (stroke: PencilStroke, event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const tick = pixelsToTicks(event.clientX - bounds.left, beatWidth) - region.getStartTick();
    const value = toValue(event.clientY - bounds.top);
    const previous = stroke.samples.at(-1);
    if (previous?.tick !== tick || previous.value !== value) stroke.samples.push({ tick, value });

    const distance = Math.max(Math.abs(event.clientX - stroke.startClientX), Math.abs(event.clientY - stroke.startClientY));
    stroke.dragged ||= distance >= PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD;
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || strokeRef.current) return;

    const stroke = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragged: false,
      samples: [],
    };
    addSample(stroke, event);
    strokeRef.current = stroke;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current;
    if (stroke?.pointerId !== event.pointerId) return;

    addSample(stroke, event);
    if (stroke.dragged) {
      const regionStartTick = region.getStartTick();
      setPreview(stroke.samples.map(({ tick, value }) => (
        `${ticksToPixels(regionStartTick + tick, beatWidth)},${toY(value)}`
      )).join(' '));
    }
  };

  const endStroke = (event: PointerEvent<SVGSVGElement>) => {
    const stroke = strokeRef.current;
    if (stroke?.pointerId !== event.pointerId) return null;

    strokeRef.current = null;
    setPreview('');
    return stroke;
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    const stroke = endStroke(event);
    if (!stroke) return;

    addSample(stroke, event);
    if (!stroke.dragged) {
      onClick?.(event.clientX, event.clientY);
      return;
    }

    const curve = simplifyAutomationStroke(stroke.samples, region.getLengthTicks());
    if (curve.length === 0) return;

    const core = KGCore.instance();
    if (automationType === 'velocity') {
      const start = curve[0].tick;
      const end = curve[curve.length - 1].tick;
      const command = createNoteVelocityCommand(region, note => {
        const tick = note.getStartTick();
        if (tick < start || tick > end) return undefined;
        return Math.round(resolveSortedMidiAutomationValueAtTick(curve, tick, 0));
      });
      if (!command) return;
      core.executeCommand(command);
    } else {
      const controller = getControllerNumberForAutomationType(automationType);
      const points = curve.map(({ tick, value }) => ({
        tick,
        value: automationType === 'pitch-bend'
          ? clampMidiPitchBendValue(value * MIDI_PITCH_BEND_MAX / MIDI_CONTROLLER_MAX)
          : clampMidiControllerValue(value),
      }));
      core.executeCommand(new ReplaceMidiAutomationCommand(region, controller, points));
    }
    refreshProjectState();
  };

  return (
    <svg
      className="piano-roll-automation-pencil"
      height={laneHeight}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={endStroke}
      onLostPointerCapture={endStroke}
    >
      {preview && <polyline className="piano-roll-automation-pencil-preview" points={preview} fill="none" />}
    </svg>
  );
}
