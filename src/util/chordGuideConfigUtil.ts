import type {
  ChordGuideCustomConfig,
  ChordGuideData,
  ChordGuideGroupKey,
  ChordGuideItem,
  ChordGuideModeDefinition,
  ChordGuideSource,
} from '../core/ChordGuideTypes';
import { getChordMidiPitches, parseChordSymbol } from './chordUtil';
import { noteNameToPitchClass } from './scaleUtil';

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const REFERENCE_SCALE_PITCH_CLASSES: Record<ChordGuideGroupKey, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], // C major
  minor: [9, 11, 0, 2, 4, 5, 7], // A natural minor
};

function toCanonicalNoteNames(pitches: number[]): string[] {
  return pitches.map((pitch) => SHARP_NOTE_NAMES[((pitch % 12) + 12) % 12]);
}

function getReferenceRootMidi(symbol: string): number | null {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return null;
  }
  return noteNameToPitchClass(descriptor.root);
}

export function deriveChordGuideNotes(symbol: string): string[] | null {
  const rootMidi = getReferenceRootMidi(symbol);
  if (rootMidi === null) {
    return null;
  }
  const pitches = getChordMidiPitches(symbol, rootMidi);
  if (pitches.length === 0) {
    return null;
  }
  return toCanonicalNoteNames(pitches);
}

export function deriveChordGuideSource(symbol: string, group: ChordGuideGroupKey): ChordGuideSource | null {
  const rootMidi = getReferenceRootMidi(symbol);
  if (rootMidi === null) {
    return null;
  }
  const pitches = getChordMidiPitches(symbol, rootMidi);
  if (pitches.length === 0) {
    return null;
  }

  const referenceScale = new Set(REFERENCE_SCALE_PITCH_CLASSES[group]);
  const isDiatonic = pitches.every((pitch) => referenceScale.has(((pitch % 12) + 12) % 12));
  return isDiatonic ? 'Diatonic' : 'Non-Diatonic';
}

export function buildDerivedChordGuideItem(
  group: ChordGuideGroupKey,
  item: Pick<ChordGuideItem, 'name' | 'note'> & Partial<Pick<ChordGuideItem, 'roman'>>
): ChordGuideItem | null {
  const notes = deriveChordGuideNotes(item.name);
  const source = deriveChordGuideSource(item.name, group);
  if (!notes || !source) {
    return null;
  }

  return {
    name: item.name,
    roman: item.roman,
    notes,
    source,
    note: item.note.trim().slice(0, 128),
  };
}

function cloneModeDefinition(definition: ChordGuideModeDefinition): ChordGuideModeDefinition {
  return {
    T: definition.T.map((item) => ({ ...item, notes: [...item.notes] })),
    S: definition.S.map((item) => ({ ...item, notes: [...item.notes] })),
    D: definition.D.map((item) => ({ ...item, notes: [...item.notes] })),
  };
}

export function buildChordGuideCustomConfigFromData(data: ChordGuideData): ChordGuideCustomConfig {
  return {
    major: cloneModeDefinition(data.ionian),
    minor: cloneModeDefinition(data.aeolian),
  };
}

export function buildChordGuideDataFromDefaultsAndConfig(
  defaults: ChordGuideData,
  customConfig: ChordGuideCustomConfig | null | undefined,
): ChordGuideData {
  if (!customConfig) {
    return {
      ionian: cloneModeDefinition(defaults.ionian),
      aeolian: cloneModeDefinition(defaults.aeolian),
    };
  }

  return {
    ionian: cloneModeDefinition(customConfig.major),
    aeolian: cloneModeDefinition(customConfig.minor),
  };
}

export function createDefaultChordForGroup(group: ChordGuideGroupKey): ChordGuideItem {
  const baseName = group === 'minor' ? 'Am' : 'C';
  const derived = buildDerivedChordGuideItem(group, { name: baseName, note: '' });
  if (!derived) {
    throw new Error(`Unable to create default chord for group ${group}`);
  }
  return derived;
}
