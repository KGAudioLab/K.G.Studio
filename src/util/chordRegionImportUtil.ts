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
  startTick: number;
  endTick: number;
  pitch: number;
  velocity: number;
}

export interface ChordRegionImportPlan {
  sourceRegionIds: string[];
  startTick: number;
  lengthTicks: number;
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
    left.getStartTick() - right.getStartTick()
  ));
  const firstRegion = sortedRegions[0];
  const lastRegion = sortedRegions[sortedRegions.length - 1];
  const startTick = firstRegion.getStartTick();
  const endTick = lastRegion.getStartTick() + lastRegion.getLengthTicks();
  const notes: ImportedChordMidiNoteData[] = [];

  for (const region of sortedRegions) {
    const midiPitches = convertChordSymbolToMidiPitches(region.getSymbol());
    if (!midiPitches) {
      return {
        ok: false,
        error: { message: `Unable to import chord "${region.getSymbol()}". Please update the chord symbol and try again.` },
      };
    }

    const noteStartTick = region.getStartTick() - startTick;
    const noteEndTick = noteStartTick + region.getLengthTicks();

    midiPitches.forEach(pitch => {
      notes.push({
        startTick: noteStartTick,
        endTick: noteEndTick,
        pitch,
        velocity: CHORD_REGION_IMPORT_VELOCITY,
      });
    });
  }

  return {
    ok: true,
    plan: {
      sourceRegionIds: sortedRegions.map(region => region.getId()),
      startTick,
      lengthTicks: endTick - startTick,
      notes,
    },
  };
}
