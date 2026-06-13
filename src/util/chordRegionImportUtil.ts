import { Note } from 'tonal';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { getChordMidiPitches, parseChordSymbol } from './chordUtil';

export const CHORD_REGION_IMPORT_MIME_TYPE = 'application/kgstudio-chord-region';
export const CHORD_REGION_IMPORT_VELOCITY = 127;
export const CHORD_REGION_IMPORT_REGION_NAME = 'Chord Progression';

export interface ChordRegionImportPayload {
  draggedRegionId: string;
  selectedRegionIds: string[];
}

export interface ImportedChordMidiNoteData {
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
}

export interface ChordRegionImportPlan {
  sourceRegionIds: string[];
  startBeat: number;
  lengthInBeats: number;
  notes: ImportedChordMidiNoteData[];
}

export interface ChordRegionImportError {
  message: string;
}

export type ChordRegionImportPlanResult =
  | { ok: true; plan: ChordRegionImportPlan }
  | { ok: false; error: ChordRegionImportError };

export function resolveChordRegionImportSelection(
  draggedRegionId: string,
  selectedRegionIds: string[],
): string[] {
  return selectedRegionIds.includes(draggedRegionId)
    ? selectedRegionIds
    : [draggedRegionId];
}

function getBaseRootMidi(symbol: string): number | null {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return null;
  }

  const rootLetter = descriptor.root.charAt(0).toUpperCase();
  const octave = ['F', 'G', 'A', 'B'].includes(rootLetter) ? 3 : 4;
  return Note.midi(`${descriptor.root}${octave}`);
}

export function convertChordSymbolToMidiPitches(symbol: string): number[] | null {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return null;
  }

  const rootMidi = getBaseRootMidi(descriptor.symbol);
  if (rootMidi === null) {
    return null;
  }

  const midiPitches = getChordMidiPitches(descriptor.symbol, rootMidi);
  if (midiPitches.length === 0) {
    return null;
  }

  return [rootMidi - 12, ...midiPitches];
}

export function buildChordRegionImportPlan(
  chordRegions: KGChordRegion[],
): ChordRegionImportPlanResult {
  if (chordRegions.length === 0) {
    return {
      ok: false,
      error: { message: 'No chord regions were available to import.' },
    };
  }

  const sortedRegions = [...chordRegions].sort((left, right) => (
    left.getStartFromBeat() - right.getStartFromBeat()
  ));
  const firstRegion = sortedRegions[0];
  const lastRegion = sortedRegions[sortedRegions.length - 1];
  const startBeat = firstRegion.getStartFromBeat();
  const endBeat = lastRegion.getStartFromBeat() + lastRegion.getLength();
  const notes: ImportedChordMidiNoteData[] = [];

  for (const region of sortedRegions) {
    const midiPitches = convertChordSymbolToMidiPitches(region.getSymbol());
    if (!midiPitches) {
      return {
        ok: false,
        error: { message: `Unable to import chord "${region.getSymbol()}". Please update the chord symbol and try again.` },
      };
    }

    const noteStartBeat = region.getStartFromBeat() - startBeat;
    const noteEndBeat = noteStartBeat + region.getLength();

    midiPitches.forEach(pitch => {
      notes.push({
        startBeat: noteStartBeat,
        endBeat: noteEndBeat,
        pitch,
        velocity: CHORD_REGION_IMPORT_VELOCITY,
      });
    });
  }

  return {
    ok: true,
    plan: {
      sourceRegionIds: sortedRegions.map(region => region.getId()),
      startBeat,
      lengthInBeats: endBeat - startBeat,
      notes,
    },
  };
}
