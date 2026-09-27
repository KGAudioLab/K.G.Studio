import { PIANO_ROLL_NO_SNAP, type PianoRollSnapValue } from '../../core/state/KGPianoRollState';
import { DEBUG_MODE } from '../../constants';
import { noteValueToTicks, toTimelineTick } from '../../core/timing';

export function getNoteValueStepTicks(noteValue: string): number | null {
  const match = noteValue.match(/^1\/(\d+)$/);
  if (!match) {
    return null;
  }

  const denominator = Number.parseInt(match[1], 10);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return noteValueToTicks(denominator);
}

export function quantizeTickPosition(tickPosition: number, noteValue: string): number | null {
  const step = getNoteValueStepTicks(noteValue);
  if (step === null) {
    return null;
  }

  return toTimelineTick(Math.round(tickPosition / step) * step);
}

export function quantizeTickLength(length: number, noteValue: string, minimumLength: number): number | null {
  const step = getNoteValueStepTicks(noteValue);
  if (step === null) {
    return null;
  }

  const quantizedLength = length < step
    ? step
    : Math.round(length / step) * step;
  return toTimelineTick(Math.max(minimumLength, quantizedLength));
}

export function getSnapStepTicks(currentSnap: PianoRollSnapValue): number | null {
  if (currentSnap === PIANO_ROLL_NO_SNAP) {
    return null;
  }

  return getNoteValueStepTicks(currentSnap);
}

export function getSnappedTickPosition(
  tickPosition: number,
  currentSnap: PianoRollSnapValue,
  useFloorSnapping: boolean = false,
): number {
  const snapStep = getSnapStepTicks(currentSnap);
  if (snapStep === null) {
    return toTimelineTick(tickPosition);
  }

  const snappedPosition = useFloorSnapping
    ? Math.floor(tickPosition / snapStep) * snapStep
    : Math.round(tickPosition / snapStep) * snapStep;

  if (DEBUG_MODE.PIANO_ROLL) {
    console.log(
      `Snapping (${useFloorSnapping ? 'floor' : 'round'}): ${tickPosition} -> ${snappedPosition} (snap: ${currentSnap}, step: ${snapStep} ticks)`,
    );
  }

  return toTimelineTick(snappedPosition);
}

export function getSnappedLength(length: number, currentSnap: PianoRollSnapValue, minimumLength: number): number {
  const snapStep = getSnapStepTicks(currentSnap);
  if (snapStep === null) {
    return toTimelineTick(length);
  }

  const snappedLength = Math.round(length / snapStep) * snapStep;
  const finalLength = Math.max(minimumLength, snappedLength);

  if (DEBUG_MODE.PIANO_ROLL) {
    console.log(`Length snapping: ${length} -> ${finalLength} (snap: ${currentSnap}, step: ${snapStep})`);
  }

  return toTimelineTick(finalLength);
}
