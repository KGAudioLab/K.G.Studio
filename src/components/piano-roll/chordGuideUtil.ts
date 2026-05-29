import type { KeySignature, KGProject } from '../../core/KGProject';
import { getEffectiveKeySignatureAtBeat } from '../../util/globalTrackUtil';
import { getChordGuideModeFromKeySignature } from '../../util/scaleUtil';

export type ChordGuideFunction = 'N' | 'T' | 'S' | 'D';
export type ChordGuideMode = 'ionian' | 'aeolian';

export function getNextChordGuideSelection(current: ChordGuideFunction): ChordGuideFunction {
  switch (current) {
    case 'N':
      return 'T';
    case 'T':
      return 'S';
    case 'S':
      return 'D';
    default:
      return 'N';
  }
}

export function getNextChordCandidateIndex(
  currentIndex: number,
  candidateCount: number,
  direction: 1 | -1
): number {
  if (candidateCount <= 1) {
    return currentIndex;
  }

  return (currentIndex + direction + candidateCount) % candidateCount;
}

export function resolveChordGuideContext(project: KGProject, beat: number): {
  keySignature: KeySignature;
  mode: ChordGuideMode;
} {
  const keySignature = getEffectiveKeySignatureAtBeat(project, beat);
  return {
    keySignature,
    mode: getChordGuideModeFromKeySignature(keySignature),
  };
}
