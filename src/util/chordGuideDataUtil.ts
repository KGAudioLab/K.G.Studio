import { KGCore } from '../core/KGCore';
import type { KeySignature } from '../core/KGProject';
import type { ChordGuideData, ChordGuideItem, ResolvedChordGuideItem } from '../core/ChordGuideTypes';
import { getChordMidiPitches, parseChordSymbol } from './chordUtil';
import { getRootNoteFromKeySignature, noteNameToPitchClass } from './scaleUtil';

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type ChordGuideMode = 'ionian' | 'aeolian';
export type ChordGuideFunctionType = 'T' | 'S' | 'D';

function getReferenceTonic(mode: ChordGuideMode): string {
  return mode === 'aeolian' ? 'A' : 'C';
}

function getChordGuideData(): ChordGuideData {
  return KGCore.CHORD_GUIDE_DATA ?? {
    ionian: { T: [], S: [], D: [] },
    aeolian: { T: [], S: [], D: [] },
  };
}

function transposePitchClass(pitchClass: number, semitones: number): number {
  return (pitchClass + semitones + 120) % 12;
}

function normalizeSemitoneOffset(semitones: number): number {
  return ((semitones % 12) + 12) % 12;
}

function toResolvedNoteNames(pitches: number[]): string[] {
  return pitches.map((pitch) => SHARP_NOTE_NAMES[((pitch % 12) + 12) % 12]);
}

function resolveChordRootPitchClass(item: ChordGuideItem, semitones: number): number | null {
  const descriptor = parseChordSymbol(item.name);
  if (!descriptor) {
    console.warn(`Unable to parse chord guide symbol: ${item.name}`);
    return null;
  }

  return transposePitchClass(noteNameToPitchClass(descriptor.root), semitones);
}

export function resolveChordGuideItems(
  keySignature: KeySignature,
  mode: ChordGuideMode,
  functionType: ChordGuideFunctionType
): ResolvedChordGuideItem[] {
  const data = getChordGuideData()[mode];
  if (!data) {
    return [];
  }

  const items = data[functionType] ?? [];
  const referenceTonic = getReferenceTonic(mode);
  const targetTonic = getRootNoteFromKeySignature(keySignature);
  const semitoneOffset = normalizeSemitoneOffset(
    noteNameToPitchClass(targetTonic) - noteNameToPitchClass(referenceTonic)
  );

  return items.flatMap((item) => {
    const rootPitchClass = resolveChordRootPitchClass(item, semitoneOffset);
    if (rootPitchClass === null) {
      return [];
    }

    const pitchClasses = getChordMidiPitches(item.name, rootPitchClass);
    if (pitchClasses.length === 0) {
      console.warn(`Unable to resolve pitch classes for chord guide symbol: ${item.name}`);
      return [];
    }

    return [{
      ...item,
      resolvedNotes: toResolvedNoteNames(pitchClasses),
      pitchClasses,
    }];
  });
}

export function getMatchingChordGuideChordsForPitch(
  hoverPitch: number,
  keySignature: KeySignature,
  mode: ChordGuideMode,
  functionType: ChordGuideFunctionType
): number[][] {
  const resolvedChords = resolveChordGuideItems(keySignature, mode, functionType);
  if (resolvedChords.length === 0) {
    return [];
  }

  const hoverPitchClass = hoverPitch % 12;
  const matchesByPosition: number[][][] = [];

  for (const item of resolvedChords) {
    for (let i = 0; i < item.pitchClasses.length; i++) {
      if (item.pitchClasses[i] % 12 !== hoverPitchClass) {
        continue;
      }

      if (!matchesByPosition[i]) {
        matchesByPosition[i] = [];
      }

      const chord = item.pitchClasses[i] >= 12
        ? item.pitchClasses.map((pitch) => pitch - 12)
        : item.pitchClasses;
      matchesByPosition[i].push(chord);
      break;
    }
  }

  return matchesByPosition.flatMap((matches) => matches ?? []);
}
