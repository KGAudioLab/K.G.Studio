import { KGProject } from '../core/KGProject';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGMidiRegion } from '../core/region/KGMidiRegion';

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export interface MidiChordWindow {
  barIndex: number;
  startBeat: number;
  endBeat: number;
}

export interface MidiChordDetectionOptions {
  enableSevenths: boolean;
  shortNoteSuppression: 'low' | 'medium' | 'high';
  harmonicFocus: 'balanced' | 'favor-sustained-notes';
}

export interface MidiChordDetectionRequest {
  project: KGProject;
  region: KGMidiRegion;
  windows: MidiChordWindow[];
  options: MidiChordDetectionOptions;
}

export interface DetectedMidiChord {
  barIndex: number;
  startBeat: number;
  endBeat: number;
  symbol: string;
  confidence: number;
  noteCount: number;
}

interface WeightedMidiNote {
  note: KGMidiNote;
  overlapBeats: number;
  baseWeight: number;
  pitchClass: number;
  absoluteStartBeat: number;
  absoluteEndBeat: number;
}

interface ChordTemplate {
  symbolSuffix: '' | 'm' | '7' | 'maj7' | 'm7';
  quality: 'major' | 'minor';
  intervals: number[];
}

interface ScoredChordCandidate {
  symbol: string;
  score: number;
}

const DEFAULT_SHORT_NOTE_THRESHOLDS: Record<MidiChordDetectionOptions['shortNoteSuppression'], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

const CHORD_TEMPLATES: ChordTemplate[] = [
  { symbolSuffix: '', quality: 'major', intervals: [0, 4, 7] },
  { symbolSuffix: 'm', quality: 'minor', intervals: [0, 3, 7] },
  { symbolSuffix: '7', quality: 'major', intervals: [0, 4, 7, 10] },
  { symbolSuffix: 'maj7', quality: 'major', intervals: [0, 4, 7, 11] },
  { symbolSuffix: 'm7', quality: 'minor', intervals: [0, 3, 7, 10] },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createPitchClassWeights(): Float64Array {
  return new Float64Array(12);
}

function getNoteOverlapInfo(
  region: KGMidiRegion,
  note: KGMidiNote,
  window: MidiChordWindow,
  options: MidiChordDetectionOptions,
): WeightedMidiNote | null {
  const absoluteStartBeat = region.getStartFromBeat() + note.getStartBeat();
  const absoluteEndBeat = region.getStartFromBeat() + note.getEndBeat();
  const overlapBeats = Math.min(absoluteEndBeat, window.endBeat) - Math.max(absoluteStartBeat, window.startBeat);

  if (overlapBeats <= 0) {
    return null;
  }

  const suppressionThreshold = DEFAULT_SHORT_NOTE_THRESHOLDS[options.shortNoteSuppression];
  const shortNoteFactor = overlapBeats >= suppressionThreshold
    ? 1
    : clamp(overlapBeats / suppressionThreshold, 0.18, 1);
  const velocityFactor = 0.92 + ((clamp(note.getVelocity(), 1, 127) - 1) / 126) * 0.08;
  const baseWeight = overlapBeats * shortNoteFactor * velocityFactor;

  return {
    note,
    overlapBeats,
    baseWeight,
    pitchClass: ((note.getPitch() % 12) + 12) % 12,
    absoluteStartBeat,
    absoluteEndBeat,
  };
}

function selectSustainedNotes(
  notes: WeightedMidiNote[],
  options: MidiChordDetectionOptions,
): WeightedMidiNote[] {
  if (notes.length === 0) {
    return [];
  }

  const longestOverlap = notes.reduce((max, note) => Math.max(max, note.overlapBeats), 0);
  const overlapRatioFloor = options.harmonicFocus === 'favor-sustained-notes' ? 0.72 : 0.55;
  const weightRatioFloor = options.harmonicFocus === 'favor-sustained-notes' ? 0.68 : 0.5;
  const maxWeight = notes.reduce((max, note) => Math.max(max, note.baseWeight), 0);

  const sustained = notes.filter(note => (
    note.overlapBeats >= longestOverlap * overlapRatioFloor ||
    note.baseWeight >= maxWeight * weightRatioFloor
  ));

  return sustained.length > 0 ? sustained : [...notes];
}

function accumulatePitchClassWeights(notes: WeightedMidiNote[]): Float64Array {
  const weights = createPitchClassWeights();
  for (const note of notes) {
    weights[note.pitchClass] += note.baseWeight;
  }
  return weights;
}

function normalizePitchClassWeights(weights: Float64Array): Float64Array {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weights;
  }

  const normalized = createPitchClassWeights();
  for (let index = 0; index < weights.length; index++) {
    normalized[index] = weights[index] / total;
  }
  return normalized;
}

function getBassPitchClass(notes: WeightedMidiNote[]): number | null {
  if (notes.length === 0) {
    return null;
  }

  let bassNote = notes[0];
  for (const note of notes) {
    if (note.note.getPitch() < bassNote.note.getPitch()) {
      bassNote = note;
    }
  }
  return bassNote.pitchClass;
}

function scoreChordTemplate(
  root: number,
  template: ChordTemplate,
  sustainedWeights: Float64Array,
  fullWeights: Float64Array,
  bassPitchClass: number | null,
  options: MidiChordDetectionOptions,
): number {
  const chordPitchClasses = template.intervals.map(interval => (root + interval) % 12);
  const chordPitchClassSet = new Set(chordPitchClasses);
  const focusWeight = options.harmonicFocus === 'favor-sustained-notes' ? 0.78 : 0.6;
  const contextWeight = 1 - focusWeight;
  const rootPc = root;
  const thirdPc = chordPitchClasses[1];
  const fifthPc = chordPitchClasses[2];
  const seventhPc = chordPitchClasses[3] ?? null;

  let score = 0;
  score += (sustainedWeights[rootPc] * 1.7 + fullWeights[rootPc] * 1.1) * focusWeight;
  score += (sustainedWeights[thirdPc] * 1.55 + fullWeights[thirdPc] * 1.0) * focusWeight;
  score += (sustainedWeights[fifthPc] * 1.2 + fullWeights[fifthPc] * 0.8) * focusWeight;

  if (seventhPc !== null) {
    score += (sustainedWeights[seventhPc] * 0.95 + fullWeights[seventhPc] * 1.0) * contextWeight;
  }

  let outsidePenalty = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
    if (chordPitchClassSet.has(pitchClass)) {
      continue;
    }
    outsidePenalty += (sustainedWeights[pitchClass] * 1.35) + (fullWeights[pitchClass] * 0.72);
  }
  score -= outsidePenalty;

  if (sustainedWeights[thirdPc] < 0.08 && fullWeights[thirdPc] < 0.09) {
    score -= 0.28;
  }

  if (seventhPc !== null && fullWeights[seventhPc] < 0.085) {
    score -= 0.18;
  }

  if (bassPitchClass !== null) {
    if (bassPitchClass === rootPc) {
      score += 0.22;
    } else if (chordPitchClassSet.has(bassPitchClass)) {
      score += 0.05;
    } else {
      score -= 0.12;
    }
  }

  return score;
}

function buildChordCandidates(
  sustainedWeights: Float64Array,
  fullWeights: Float64Array,
  bassPitchClass: number | null,
  options: MidiChordDetectionOptions,
): { best: ScoredChordCandidate; second: ScoredChordCandidate } {
  const allowedTemplates = options.enableSevenths
    ? CHORD_TEMPLATES
    : CHORD_TEMPLATES.filter(template => template.symbolSuffix === '' || template.symbolSuffix === 'm');
  let best: ScoredChordCandidate = { symbol: 'N', score: Number.NEGATIVE_INFINITY };
  let second: ScoredChordCandidate = { symbol: 'N', score: Number.NEGATIVE_INFINITY };

  for (let root = 0; root < 12; root++) {
    for (const template of allowedTemplates) {
      const symbol = `${ROOT_NAMES[root]}${template.symbolSuffix}`;
      const score = scoreChordTemplate(root, template, sustainedWeights, fullWeights, bassPitchClass, options);
      const candidate = { symbol, score };
      if (candidate.score > best.score) {
        second = best;
        best = candidate;
      } else if (candidate.score > second.score) {
        second = candidate;
      }
    }
  }

  return { best, second };
}

function analyzeMidiChordWindow(
  region: KGMidiRegion,
  window: MidiChordWindow,
  options: MidiChordDetectionOptions,
): { symbol: string; confidence: number; noteCount: number } {
  const overlappingNotes = region.getNotes()
    .map(note => getNoteOverlapInfo(region, note, window, options))
    .filter((note): note is WeightedMidiNote => note !== null);

  if (overlappingNotes.length < 2) {
    return { symbol: 'N', confidence: 0, noteCount: overlappingNotes.length };
  }

  const sustainedNotes = selectSustainedNotes(overlappingNotes, options);
  const sustainedDistinctPitchClasses = new Set(sustainedNotes.map(note => note.pitchClass));
  if (sustainedDistinctPitchClasses.size < 2) {
    return { symbol: 'N', confidence: 0, noteCount: overlappingNotes.length };
  }

  const sustainedWeights = normalizePitchClassWeights(accumulatePitchClassWeights(sustainedNotes));
  const fullWeights = normalizePitchClassWeights(accumulatePitchClassWeights(overlappingNotes));
  const bassPitchClass = getBassPitchClass(sustainedNotes);
  const { best, second } = buildChordCandidates(sustainedWeights, fullWeights, bassPitchClass, options);

  const rootName = best.symbol.endsWith('maj7')
    ? best.symbol.slice(0, -4)
    : best.symbol.endsWith('m7')
      ? best.symbol.slice(0, -2)
      : best.symbol.endsWith('7')
        ? best.symbol.slice(0, -1)
        : best.symbol.endsWith('m')
          ? best.symbol.slice(0, -1)
          : best.symbol;
  const rootPitchClass = ROOT_NAMES.indexOf(rootName as typeof ROOT_NAMES[number]);
  const rootWeight = rootPitchClass >= 0 ? sustainedWeights[rootPitchClass] + fullWeights[rootPitchClass] : 0;
  const confidence = clamp((best.score - second.score) + (rootWeight * 0.65), 0, 1);

  if (best.score < 0.16 || confidence < 0.12) {
    return { symbol: 'N', confidence: 0, noteCount: overlappingNotes.length };
  }

  return {
    symbol: best.symbol,
    confidence,
    noteCount: overlappingNotes.length,
  };
}

export const DEFAULT_MIDI_CHORD_DETECTION_OPTIONS: MidiChordDetectionOptions = {
  enableSevenths: false,
  shortNoteSuppression: 'medium',
  harmonicFocus: 'favor-sustained-notes',
};

export function buildMidiChordWindowsForRegion(
  project: KGProject,
  midiRegion: KGMidiRegion,
): MidiChordWindow[] {
  const regionStartBeat = midiRegion.getStartFromBeat();
  const regionEndBeat = regionStartBeat + midiRegion.getLength();
  if (regionEndBeat <= regionStartBeat) {
    return [];
  }

  const beatsPerBar = project.getTimeSignature().numerator;
  const startBarIndex = Math.floor(regionStartBeat / beatsPerBar);
  const lastBeatExclusive = regionEndBeat - 1e-9;
  const endBarIndexExclusive = Math.max(
    startBarIndex + 1,
    Math.ceil(Math.max(regionStartBeat, lastBeatExclusive) / beatsPerBar),
  );

  const windows: MidiChordWindow[] = [];
  for (let barIndex = startBarIndex; barIndex < endBarIndexExclusive; barIndex++) {
    const barStartBeat = barIndex * beatsPerBar;
    const barEndBeat = barStartBeat + beatsPerBar;
    const overlapStartBeat = Math.max(regionStartBeat, barStartBeat);
    const overlapEndBeat = Math.min(regionEndBeat, barEndBeat);
    if (overlapEndBeat <= overlapStartBeat) {
      continue;
    }

    windows.push({
      barIndex,
      startBeat: overlapStartBeat,
      endBeat: overlapEndBeat,
    });
  }

  return windows;
}

export function detectChordsFromMidi(request: MidiChordDetectionRequest): DetectedMidiChord[] {
  const options: MidiChordDetectionOptions = {
    ...DEFAULT_MIDI_CHORD_DETECTION_OPTIONS,
    ...request.options,
  };

  return request.windows.map(window => {
    const analysis = analyzeMidiChordWindow(request.region, window, options);
    return {
      barIndex: window.barIndex,
      startBeat: window.startBeat,
      endBeat: window.endBeat,
      symbol: analysis.symbol,
      confidence: analysis.confidence,
      noteCount: analysis.noteCount,
    };
  });
}
