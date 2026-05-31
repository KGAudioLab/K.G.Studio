import { PIANO_ROLL_NO_SNAP, type PianoRollSnapValue } from '../../core/state/KGPianoRollState';
import { DEBUG_MODE } from '../../constants';

export function getSnapStep(currentSnap: PianoRollSnapValue): number | null {
  if (currentSnap === PIANO_ROLL_NO_SNAP) {
    return null;
  }

  const denominator = parseInt(currentSnap.split('/')[1], 10);
  if (Number.isNaN(denominator)) {
    return null;
  }

  return 4 / denominator;
}

export function getSnappedBeatPosition(
  beatPosition: number,
  currentSnap: PianoRollSnapValue,
  useFloorSnapping: boolean = false,
): number {
  const snapStep = getSnapStep(currentSnap);
  if (snapStep === null) {
    return beatPosition;
  }

  const snappedPosition = useFloorSnapping
    ? Math.floor(beatPosition / snapStep) * snapStep
    : Math.round(beatPosition / snapStep) * snapStep;

  if (DEBUG_MODE.PIANO_ROLL) {
    console.log(
      `Snapping (${useFloorSnapping ? 'floor' : 'round'}): ${beatPosition} -> ${snappedPosition} (snap: ${currentSnap}, step: ${snapStep})`,
    );
  }

  return snappedPosition;
}

export function getSnappedLength(length: number, currentSnap: PianoRollSnapValue, minimumLength: number): number {
  const snapStep = getSnapStep(currentSnap);
  if (snapStep === null) {
    return length;
  }

  const snappedLength = Math.round(length / snapStep) * snapStep;
  const finalLength = Math.max(minimumLength, snappedLength);

  if (DEBUG_MODE.PIANO_ROLL) {
    console.log(`Length snapping: ${length} -> ${finalLength} (snap: ${currentSnap}, step: ${snapStep})`);
  }

  return finalLength;
}
