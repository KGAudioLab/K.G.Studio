import { DEBUG_MODE } from '../../constants';

export function getSnapStep(currentSnap: string): number | null {
  if (currentSnap === 'NO SNAP') {
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
  currentSnap: string,
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

export function getSnappedLength(length: number, currentSnap: string, minimumLength: number): number {
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
