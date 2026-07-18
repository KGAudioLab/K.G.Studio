/**
 * ABC Notation conversion utilities for KGSP
 * Converts MIDI regions to ABC notation format
 */

import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGCore } from '../core/KGCore';
import { KGProject, type KeySignature } from '../core/KGProject';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { FLUIDR3_INSTRUMENT_MAP } from '../constants/generalMidiConstants';
import { beatsToTicks, getTicksPerBar, reduceFraction, ticksToBeats } from './mathUtil';
import type { TimeSignature } from '../types/projectTypes';
import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';
import { getChordMidiPitches, parseChordSymbol } from './chordUtil';
import { getEffectiveBpmAtBeat, getEffectiveKeySignatureAtBeat, findGlobalTrackByType } from './globalTrackUtil';
import { GlobalTrackType } from '../core/global-track';

// MIDI timing constants
const TICKS_PER_QUARTER_NOTE = 480;
const TICKS_PER_SIXTEENTH_NOTE = TICKS_PER_QUARTER_NOTE / 4; // 120 ticks

/**
 * ABC Note data structure for processing
 */
interface ABCNote {
  pitches: number[]; // MIDI pitches; an empty array represents a rest
  startTick: number; // Start time in MIDI ticks
  endTick: number; // End time in MIDI ticks
  tieWithNext: boolean; // Whether this note should be tied to the next note
}

type ABCAccidental = '' | '#' | 'b';

interface ABCPitchSpelling {
  letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  accidental: ABCAccidental;
  semitoneOffset: -1 | 0 | 1;
}

const ABC_PITCH_SPELLINGS: Record<number, ABCPitchSpelling[]> = {
  0: [{ letter: 'C', accidental: '', semitoneOffset: 0 }, { letter: 'B', accidental: '#', semitoneOffset: 1 }],
  1: [{ letter: 'C', accidental: '#', semitoneOffset: 1 }, { letter: 'D', accidental: 'b', semitoneOffset: -1 }],
  2: [{ letter: 'D', accidental: '', semitoneOffset: 0 }],
  3: [{ letter: 'D', accidental: '#', semitoneOffset: 1 }, { letter: 'E', accidental: 'b', semitoneOffset: -1 }],
  4: [{ letter: 'E', accidental: '', semitoneOffset: 0 }, { letter: 'F', accidental: 'b', semitoneOffset: -1 }],
  5: [{ letter: 'F', accidental: '', semitoneOffset: 0 }, { letter: 'E', accidental: '#', semitoneOffset: 1 }],
  6: [{ letter: 'F', accidental: '#', semitoneOffset: 1 }, { letter: 'G', accidental: 'b', semitoneOffset: -1 }],
  7: [{ letter: 'G', accidental: '', semitoneOffset: 0 }],
  8: [{ letter: 'G', accidental: '#', semitoneOffset: 1 }, { letter: 'A', accidental: 'b', semitoneOffset: -1 }],
  9: [{ letter: 'A', accidental: '', semitoneOffset: 0 }],
  10: [{ letter: 'A', accidental: '#', semitoneOffset: 1 }, { letter: 'B', accidental: 'b', semitoneOffset: -1 }],
  11: [{ letter: 'B', accidental: '', semitoneOffset: 0 }, { letter: 'C', accidental: 'b', semitoneOffset: -1 }],
};

const NATURAL_PITCH_CLASSES: Record<ABCPitchSpelling['letter'], number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface ChordProgressionSegment {
  symbol: string;
  startBeat: number;
  endBeat: number;
}

// Define valid quantization fraction types
// type QuantizationFraction = '1/1' | '1/2' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32'; // future
type QuantizationFraction = '1/1' | '1/2' | '1/4' | '1/8' | '1/16';

// Standard note duration values for quantization (in ticks relative to quarter note)
const QUANTIZATION_TICKS: Record<QuantizationFraction, number> = {
  '1/1': TICKS_PER_QUARTER_NOTE * 4,    // 1920 ticks (whole note)
  '1/2': TICKS_PER_QUARTER_NOTE * 2,    // 960 ticks (half note)
  // '1/3': TICKS_PER_QUARTER_NOTE * 4 / 3, // 640 ticks (dotted half / triplet whole)
  '1/4': TICKS_PER_QUARTER_NOTE,        // 480 ticks (quarter note)
  // '1/6': TICKS_PER_QUARTER_NOTE * 2 / 3, // 320 ticks (triplet half)
  '1/8': TICKS_PER_QUARTER_NOTE / 2,    // 240 ticks (eighth note)
  // '1/12': TICKS_PER_QUARTER_NOTE / 3,   // 160 ticks (triplet quarter)
  '1/16': TICKS_PER_QUARTER_NOTE / 4,   // 120 ticks (sixteenth note)
  // '1/24': TICKS_PER_QUARTER_NOTE / 6,   // 80 ticks (triplet eighth)
  // '1/32': TICKS_PER_QUARTER_NOTE / 8,   // 60 ticks (thirty-second note)
};


/**
 * Convert MIDI pitch number to ABC notation
 * @param pitch - MIDI pitch number (0-127)
 * @returns ABC notation string (e.g., "C", "c", "c'", "C,")
 */
function formatABCOctave(letter: ABCPitchSpelling['letter'], octave: number): string {
  if (octave >= 4) {
    if (octave === 4) {
      return letter;
    } else if (octave === 5) {
      return letter.toLowerCase();
    } else {
      const apostrophes = "'".repeat(octave - 5);
      return letter.toLowerCase() + apostrophes;
    }
  } else {
    const commas = ",".repeat(4 - octave);
    return letter + commas;
  }
}

function chooseABCPitchSpelling(pitch: number, keySignature: KeySignature): ABCPitchSpelling {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const candidates = ABC_PITCH_SPELLINGS[pitchClass];
  const keyEntry = KEY_SIGNATURE_MAP[keySignature];
  const signatureSpelling = candidates.find(candidate => (
    candidate.accidental !== '' &&
    (keyEntry.accidentals as readonly string[]).includes(`${candidate.letter}${candidate.accidental}`)
  ));

  if (signatureSpelling) {
    return signatureSpelling;
  }

  const naturalSpelling = candidates.find(candidate => candidate.accidental === '');
  if (naturalSpelling) {
    return naturalSpelling;
  }

  const preferredAccidental: ABCAccidental = keyEntry.flats > 0 ? 'b' : '#';
  return candidates.find(candidate => candidate.accidental === preferredAccidental)
    ?? candidates[0];
}

function getKeySignatureAccidental(
  keySignature: KeySignature,
  letter: ABCPitchSpelling['letter'],
): ABCAccidental {
  const accidental = KEY_SIGNATURE_MAP[keySignature].accidentals
    .find(candidate => candidate.startsWith(letter));
  return accidental?.endsWith('#') ? '#' : accidental?.endsWith('b') ? 'b' : '';
}

function midiPitchToABCNote(
  pitch: number,
  keySignature: KeySignature,
  accidentalState: Map<string, ABCAccidental>,
  asCMajor: boolean = false,
): string {
  const spelling = chooseABCPitchSpelling(pitch, keySignature);
  const naturalPitchClass = NATURAL_PITCH_CLASSES[spelling.letter];
  const octave = ((pitch - naturalPitchClass - spelling.semitoneOffset) / 12) - 1;
  const stateKey = `${spelling.letter}/${octave}`;
  const keySignatureAccidental = getKeySignatureAccidental(keySignature, spelling.letter);
  const currentAccidental = accidentalState.get(stateKey) ?? keySignatureAccidental;
  let prefix = '';

  if (
    asCMajor &&
    spelling.accidental !== '' &&
    spelling.accidental === keySignatureAccidental &&
    !accidentalState.has(stateKey)
  ) {
    prefix = spelling.accidental === '#' ? '^' : '_';
    accidentalState.set(stateKey, spelling.accidental);
  } else if (spelling.accidental !== currentAccidental) {
    prefix = spelling.accidental === '#' ? '^' : spelling.accidental === 'b' ? '_' : '=';
    accidentalState.set(stateKey, spelling.accidental);
  }

  return `${prefix}${formatABCOctave(spelling.letter, octave)}`;
}

/**
 * Quantize note duration in ticks to nearest standard musical grid
 * @param durationTicks - Duration in MIDI ticks
 * @returns Quantized duration in ticks
 */
function quantizeDuration(durationTicks: number): number {
  let bestMatch: QuantizationFraction = '1/4'; // Default to quarter note
  let minError = Infinity;
  
  for (const [fraction, ticksPerUnit] of Object.entries(QUANTIZATION_TICKS)) {
    const remainder = durationTicks % ticksPerUnit;
    // Check both remainder and (ticksPerUnit - remainder) to find closest alignment
    const error = Math.min(remainder, ticksPerUnit - remainder);
    
    if (error < minError) {
      minError = error;
      bestMatch = fraction as QuantizationFraction;
    }
  }
  
  // Quantize to the best grid and return ticks
  const bestTicksPerUnit = QUANTIZATION_TICKS[bestMatch];
  const units = Math.round(durationTicks / bestTicksPerUnit);
  return units * bestTicksPerUnit;
}


/**
 * Convert ticks to ABC notation length string
 * @param ticks - Duration in MIDI ticks
 * @param timeSignature - Project time signature for proper length calculation
 * @returns ABC length string (e.g., "4", "8", "2/3", etc.)
 */
function convertTicksToABCLength(ticks: number, timeSignature: TimeSignature): string {
  // ABC notation uses note length relative to the default note length (L: field)
  // We now set L:1/denominator in the header, so the base unit changes with time signature
  // For 4/4: L:1/4 means quarter note = length 1
  // For 6/8: L:1/8 means eighth note = length 1
  
  const sixteenthNotes = Math.round(ticks / TICKS_PER_SIXTEENTH_NOTE);
  
  if (sixteenthNotes <= 0) {
    return "1"; // Minimum length
  }
  
  // Convert from sixteenth note units to the time signature's base unit
  // For 4/4: 16/4 = 4, so quarter note = 4 sixteenth notes
  // For 6/8: 16/8 = 2, so eighth note = 2 sixteenth notes
  const baseUnitInSixteenths = 16 / timeSignature.denominator;
  
  // Calculate the length in terms of the base unit
  const lengthInBaseUnits = sixteenthNotes / baseUnitInSixteenths;
  
  // Check if it's a whole number
  if (Number.isInteger(lengthInBaseUnits)) {
    return lengthInBaseUnits === 1 ? '' : lengthInBaseUnits.toString();
  }
  
  // If not a whole number, express as a fraction
  // Convert to fraction by finding common denominator
  const numerator = Math.round(lengthInBaseUnits * baseUnitInSixteenths);
  const denominator = baseUnitInSixteenths;
  
  // Reduce fraction to lowest terms using GCD
  const reduced = reduceFraction(numerator, denominator);
  
  if (reduced.denominator === 1) {
    return reduced.numerator.toString();
  }
  
  return `${reduced.numerator}/${reduced.denominator}`;
}

/**
 * Format ABC notation header
 * @param region - MIDI region to convert
 * @param project - Project containing tempo and time signature info
 * @returns ABC header string
 */
function resolveRegionTrackMetadata(region: KGMidiRegion, project: KGProject): {
  trackId: string;
  trackName: string;
  instrumentName: string;
} {
  const trackId = String(region.getTrackId());
  const track = project.getTracks().find(candidate => candidate.getId().toString() === trackId);
  const midiTrack = track?.getCurrentType() === 'KGMidiTrack'
    ? track as KGMidiTrack
    : null;
  const trackName = track?.getName() || 'Unnamed Track';
  const instrumentKey = midiTrack?.getInstrument() ?? null;
  const instrumentName = instrumentKey
    ? FLUIDR3_INSTRUMENT_MAP[instrumentKey]?.displayName || String(instrumentKey)
    : 'Unknown Instrument';

  return { trackId, trackName, instrumentName };
}

function formatABCHeader(region: KGMidiRegion, project: KGProject, beat: number): string {
  const timeSignature = project.getTimeSignature();
  const bpm = getEffectiveBpmAtBeat(project, beat);
  const keySignature = getEffectiveKeySignatureAtBeat(project, beat);
  const { trackId, trackName, instrumentName } = resolveRegionTrackMetadata(region, project);
  
  // Get ABC notation key signature from the key signature map
  const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
  
  const header = [
    `track_id: ${trackId}`,
    `track_name: ${trackName}`,
    `Instrument: ${instrumentName}`,
    'X:1', // Reference number
    `M:${timeSignature.numerator}/${timeSignature.denominator}`, // Time signature
    `L:1/${timeSignature.denominator}`, // note length unit should be aligned with time signature
    `Q:1/${timeSignature.denominator}=${bpm}`, // Tempo (quarter note = BPM)
    `K:${abcKeySignature}` // Key signature from project settings
  ];
  
  return header.join('\n');
}

function formatABCSharedHeader(project: KGProject, beat: number): string {
  const timeSignature = project.getTimeSignature();
  const bpm = getEffectiveBpmAtBeat(project, beat);
  const keySignature = getEffectiveKeySignatureAtBeat(project, beat);
  const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';

  return [
    `M:${timeSignature.numerator}/${timeSignature.denominator}`,
    `L:1/${timeSignature.denominator}`,
    `Q:1/${timeSignature.denominator}=${bpm}`,
    `K:${abcKeySignature}`
  ].join('\n');
}

function getChordRootMidi(symbol: string): number | null {
  const descriptor = parseChordSymbol(symbol);
  if (!descriptor) {
    return null;
  }

  const rootToPitchClass: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
  };

  const pitchClass = rootToPitchClass[descriptor.root];
  if (pitchClass === undefined) {
    return null;
  }

  const middleCOctaveMidi = 60 + pitchClass;
  return middleCOctaveMidi > 64 ? middleCOctaveMidi - 12 : middleCOctaveMidi;
}

function formatBeatsToABCLength(lengthBeats: number, timeSignature: TimeSignature): string {
  const ticks = beatsToTicks(lengthBeats, timeSignature);
  return convertTicksToABCLength(ticks, timeSignature);
}

function splitSegmentAtBarBoundaries(
  startBeat: number,
  endBeat: number,
  beatsPerBar: number,
): Array<{ startBeat: number; endBeat: number }> {
  const segments: Array<{ startBeat: number; endBeat: number }> = [];
  let currentStart = startBeat;

  while (currentStart < endBeat) {
    const nextBarBeat = Math.floor(currentStart / beatsPerBar + 1) * beatsPerBar;
    const currentEnd = Math.min(endBeat, nextBarBeat);
    segments.push({ startBeat: currentStart, endBeat: currentEnd });
    currentStart = currentEnd;
  }

  return segments;
}

function formatTimedChordTokens(
  values: string[],
  segments: ChordProgressionSegment[],
  timeSignature: TimeSignature,
): string {
  const beatsPerBar = timeSignature.numerator;
  const tokens: string[] = [];

  segments.forEach((segment, index) => {
    const splitSegments = splitSegmentAtBarBoundaries(segment.startBeat, segment.endBeat, beatsPerBar);
    splitSegments.forEach((part) => {
      const length = formatBeatsToABCLength(part.endBeat - part.startBeat, timeSignature);
      tokens.push(`[${values[index]}]${length}`);
      tokens.push('|');
    });
  });

  return tokens.join(' ');
}

export function getChordProgressionSegmentsForBeatRange(
  project: KGProject,
  startBeat: number,
  endBeat: number,
): ChordProgressionSegment[] {
  if (endBeat <= startBeat) {
    return [];
  }

  const chordTrack = findGlobalTrackByType(project, GlobalTrackType.Chord);
  if (!chordTrack) {
    return [];
  }

  return chordTrack.getRegions()
    .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
    .map((region) => ({
      region,
      startBeat: Math.max(startBeat, region.getStartFromBeat()),
      endBeat: Math.min(endBeat, region.getStartFromBeat() + region.getLength()),
    }))
    .filter(({ startBeat: segmentStart, endBeat: segmentEnd }) => segmentEnd > segmentStart)
    .sort((left, right) => left.startBeat - right.startBeat)
    .map(({ region, startBeat: segmentStart, endBeat: segmentEnd }) => ({
      symbol: region.getSymbol(),
      startBeat: segmentStart,
      endBeat: segmentEnd,
    }));
}

export function formatChordProgressionSymbolLine(
  segments: ChordProgressionSegment[],
  timeSignature: TimeSignature,
): string {
  return formatTimedChordTokens(
    segments.map(segment => segment.symbol),
    segments,
    timeSignature,
  );
}

export function formatChordProgressionNoteLine(
  segments: ChordProgressionSegment[],
  timeSignature: TimeSignature,
  resolveKeySignature: (beat: number) => KeySignature = () => 'C major',
  initialKeySignature: KeySignature = resolveKeySignature(segments[0]?.startBeat ?? 0),
): string {
  let previousKeySignature = initialKeySignature;
  const tokens: string[] = [];

  segments.forEach((segment) => {
    const rootMidi = getChordRootMidi(segment.symbol);
    if (rootMidi === null) {
      throw new Error(`Unable to parse chord "${segment.symbol}"`);
    }

    const pitches = getChordMidiPitches(segment.symbol, rootMidi);
    if (pitches.length === 0) {
      throw new Error(`Unable to parse chord "${segment.symbol}"`);
    }

    splitSegmentAtBarBoundaries(
      segment.startBeat,
      segment.endBeat,
      timeSignature.numerator,
    ).forEach((part) => {
      const keySignature = resolveKeySignature(part.startBeat);
      if (previousKeySignature !== keySignature) {
        tokens.push(`[K:${KEY_SIGNATURE_MAP[keySignature].abcNotationKeySignature}]`);
        previousKeySignature = keySignature;
      }

      const accidentalState = new Map<string, ABCAccidental>();
      const chordNotes = pitches
        .map(pitch => midiPitchToABCNote(pitch, keySignature, accidentalState))
        .join(' ');
      const length = formatBeatsToABCLength(part.endBeat - part.startBeat, timeSignature);
      tokens.push(`[${chordNotes}]${length}`);
      tokens.push('|');
    });
  });

  return tokens.join(' ');
}

export function convertBeatRangeChordProgressionToABCNotation(
  project: KGProject,
  startBeat: number,
  endBeat: number,
): string {
  const segments = getChordProgressionSegmentsForBeatRange(project, startBeat, endBeat);
  const header = formatABCSharedHeader(project, startBeat);

  if (segments.length === 0) {
    return [
      'Chord Progression',
      'This progression comes only from user-defined chord regions on the global chord track. If no chord progression is defined for this range, read the notes directly with `read_music`.',
      '',
      header,
      '',
      'No chord progression is defined for the requested range on the global chord track. Use `read_music` to inspect the notes directly.'
    ].join('\n');
  }

  const timeSignature = project.getTimeSignature();
  const chordSymbols = formatChordProgressionSymbolLine(segments, timeSignature);
  const chordNotes = formatChordProgressionNoteLine(
    segments,
    timeSignature,
    beat => getEffectiveKeySignatureAtBeat(project, beat),
    getEffectiveKeySignatureAtBeat(project, startBeat),
  );

  return [
    'Chord Progression',
    'This progression comes only from user-defined chord regions on the global chord track. Representation 1 uses symbolic chord names such as `Em7b5`. Representation 2 rewrites the same progression as note-based ABC chord tokens.',
    '',
    header,
    '',
    'Chord-symbol representation:',
    chordSymbols,
    '',
    'Note-based ABC chord representation:',
    chordNotes,
  ].join('\n');
}

/**
 * Format ABC notation body with notes
 * @param notes - Array of MIDI notes to convert
 * @param relativeStartBeat - Start position relative to region
 * @param timeSignature - Project time signature
 * @returns ABC body string
 */
function formatABCBody(
  notes: KGMidiNote[],
  relativeStartBeat: number,
  timeSignature: TimeSignature,
  project: KGProject,
  regionStartBeat: number,
  initialKeySignature: KeySignature,
  asCMajor: boolean,
): string {
  if (notes.length === 0) {
    return 'z16 |'; // Rest for one bar if no notes
  }

  // Calculate ticks per bar based on time signature
  const ticksPerBar = getTicksPerBar(timeSignature);

  // Step 1: Convert all notes to ABCNote instances
  const abcNotes: ABCNote[] = [];
  
  for (const note of notes) {
    const startBeats = note.getStartBeat();
    const endBeats = note.getEndBeat();
    
    // Convert beats to ticks
    const startTicks = beatsToTicks(startBeats, timeSignature);
    const endTicks = beatsToTicks(endBeats, timeSignature);
    
    // Quantize to closest 1/16 beat (120 ticks)
    const quantizedStartTicks = Math.round(startTicks / TICKS_PER_SIXTEENTH_NOTE) * TICKS_PER_SIXTEENTH_NOTE;
    const quantizedEndTicks = Math.round(endTicks / TICKS_PER_SIXTEENTH_NOTE) * TICKS_PER_SIXTEENTH_NOTE;
    
    abcNotes.push({
      pitches: [note.getPitch()],
      startTick: quantizedStartTicks,
      endTick: quantizedEndTicks,
      tieWithNext: false
    });
  }

  // Step 2: Sort by startTick, then by endTick
  abcNotes.sort((a, b) => {
    if (a.startTick !== b.startTick) {
      return a.startTick - b.startTick;
    }
    return a.endTick - b.endTick;
  });

  // Step 3: Apply quantizeDuration to find best fit durations
  for (const abcNote of abcNotes) {
    const originalDuration = abcNote.endTick - abcNote.startTick;
    const quantizedDuration = quantizeDuration(originalDuration);
    abcNote.endTick = abcNote.startTick + quantizedDuration;
  }

  // Step 4: Sort again after quantization
  abcNotes.sort((a, b) => {
    if (a.startTick !== b.startTick) {
      return a.startTick - b.startTick;
    }
    return a.endTick - b.endTick;
  });

  // Step 5: Handle polyphonic notes and overlapping notes
  for (let i = 0; i < abcNotes.length - 1; ) {
    const currentNote = abcNotes[i];
    let nextIndex = i + 1;
    
    // First, check for notes with identical startTick and endTick (polyphonic notes)
    while (nextIndex < abcNotes.length && 
           currentNote.startTick === abcNotes[nextIndex].startTick && 
           currentNote.endTick === abcNotes[nextIndex].endTick) {
      const nextNote = abcNotes[nextIndex];
      // Merge the pitch into current note's pitch array
      currentNote.pitches.push(...nextNote.pitches);
      // Remove the next note since it's now part of the current chord
      abcNotes.splice(nextIndex, 1);
    }
    
    // Then, check if current note overlaps with remaining next notes
    while (nextIndex < abcNotes.length && currentNote.endTick > abcNotes[nextIndex].startTick) {
      const nextNote = abcNotes[nextIndex];
      
      if (currentNote.endTick > nextNote.endTick) {
        // Current note completely covers next note - remove next note
        abcNotes.splice(nextIndex, 1);
        // Don't increment nextIndex since we removed an element
      } else {
        // Truncate current note to avoid overlap
        currentNote.endTick = nextNote.startTick;
        nextIndex++;
        break;
      }
    }
    
    i++;
  }

  // Step 6: Insert rests where needed
  const finalNotes: ABCNote[] = [];
  const relativeStartTicks = beatsToTicks(relativeStartBeat, timeSignature);
  
  for (let i = 0; i < abcNotes.length; i++) {
    const currentNote = abcNotes[i];
    const prevEndTick = i === 0 ? relativeStartTicks : finalNotes[finalNotes.length - 1].endTick;
    
    // Add rest if there's a gap
    if (currentNote.startTick > prevEndTick) {
      finalNotes.push({
        pitches: [],
        startTick: prevEndTick,
        endTick: currentNote.startTick,
        tieWithNext: false
      });
    }
    
    finalNotes.push(currentNote);
  }

  // Step 6.1: Complete the last bar with a rest if needed
  if (finalNotes.length > 0) {
    const lastNote = finalNotes[finalNotes.length - 1];
    const lastNoteEndTick = lastNote.endTick;
    
    // Check if the last note ends exactly on a bar boundary
    const ticksFromBarStart = (lastNoteEndTick - relativeStartTicks) % ticksPerBar;
    
    // If the last note doesn't end on a bar boundary, complete the bar with a rest
    if (ticksFromBarStart !== 0) {
      const lastBarIndex = Math.floor((lastNoteEndTick - relativeStartTicks) / ticksPerBar);
      const lastBarEndTick = relativeStartTicks + ((lastBarIndex + 1) * ticksPerBar);
      
      finalNotes.push({
        pitches: [],
        startTick: lastNoteEndTick,
        endTick: lastBarEndTick,
        tieWithNext: false
      });
    }
  }

  // Step 6.5: Split notes that cross bar boundaries
  const splitNotes: ABCNote[] = [];
  
  for (const note of finalNotes) {
    // Find which bar this note starts in
    const startBarIndex = Math.floor((note.startTick - relativeStartTicks) / ticksPerBar);
    const endBarIndex = Math.floor((note.endTick - relativeStartTicks - 1) / ticksPerBar); // -1 to handle exact bar boundaries
    
    if (startBarIndex === endBarIndex) {
      // Note fits within a single bar
      splitNotes.push(note);
    } else {
      // Note crosses bar boundaries - split it
      const currentNote = { ...note };
      
      for (let barIndex = startBarIndex; barIndex <= endBarIndex; barIndex++) {
        const barStartTick = relativeStartTicks + (barIndex * ticksPerBar);
        const barEndTick = barStartTick + ticksPerBar;
        
        const noteStartInBar = Math.max(currentNote.startTick, barStartTick);
        const noteEndInBar = Math.min(currentNote.endTick, barEndTick);
        
        const isLastPart = (barIndex === endBarIndex);
        
        splitNotes.push({
          pitches: currentNote.pitches,
          startTick: noteStartInBar,
          endTick: noteEndInBar,
          tieWithNext: !isLastPart && currentNote.pitches.length > 0 // Don't tie rests
        });
      }
    }
  }

  // Step 7: Generate ABC notation output with bar lines and ties
  const abcStrings: string[] = [];
  const accidentalState = new Map<string, ABCAccidental>();
  let activeKeySignature = initialKeySignature;
  let previousBarIndex: number | null = null;
  
  for (let i = 0; i < splitNotes.length; i++) {
    const note = splitNotes[i];
    const duration = note.endTick - note.startTick;
    const lengthString = convertTicksToABCLength(duration, timeSignature);
    const currentBarIndex = Math.floor((note.startTick - relativeStartTicks) / ticksPerBar);
    if (currentBarIndex !== previousBarIndex) {
      accidentalState.clear();
      previousBarIndex = currentBarIndex;
    }

    const absoluteBeat = regionStartBeat + ticksToBeats(note.startTick, timeSignature);
    const effectiveKeySignature = getEffectiveKeySignatureAtBeat(project, absoluteBeat);
    if (effectiveKeySignature !== activeKeySignature) {
      activeKeySignature = effectiveKeySignature;
      accidentalState.clear();
      abcStrings.push(`[K:${KEY_SIGNATURE_MAP[activeKeySignature].abcNotationKeySignature}]`);
    }
    
    // Build note string with length - handle polyphonic notes
    let noteString: string;
    if (note.pitches.length === 0) {
      noteString = `z${lengthString}`;
    } else if (note.pitches.length === 1) {
      // Single note
      noteString = `${midiPitchToABCNote(note.pitches[0], activeKeySignature, accidentalState, asCMajor)}${lengthString}`;
    } else {
      // Polyphonic note (chord) - use ABC chord notation [C E G]
      const chordNotes = note.pitches
        .map(pitch => midiPitchToABCNote(pitch, activeKeySignature, accidentalState, asCMajor))
        .join(' ');
      noteString = `[${chordNotes}]${lengthString}`;
    }
    
    // Add tie if needed
    if (note.tieWithNext) {
      noteString += '-';
    }
    
    abcStrings.push(noteString);
    
    // Check if we've reached the end of a bar
    const nextNote = splitNotes[i + 1];
    
    if (nextNote) {
      const nextBarIndex = Math.floor((nextNote.startTick - relativeStartTicks) / ticksPerBar);
      
      // Add bar line if we're moving to a new bar
      if (nextBarIndex > currentBarIndex) {
        abcStrings.push('|');
      }
    }
  }
  
  // Add final bar line
  abcStrings.push('|');
  
  return abcStrings.join(' ');
}

/**
 * Convert a MIDI region to ABC notation
 * @param region - The MIDI region to convert
 * @param startFromBeat - Absolute beat position to start conversion from
 * @returns ABC notation as plain text string
 */
export function convertRegionToABCNotation(
  region: KGMidiRegion,
  startFromBeat: number,
  endBeat?: number,
  asCMajor: boolean = false,
): string {
  // Get project information
  const project = KGCore.instance().getCurrentProject();
  const timeSignature = project.getTimeSignature();
  const beatsPerBar = timeSignature.numerator;
  
  // Round startFromBeat to floor bar beats and endBeat to next bar beats
  const roundedStartBeat = Math.floor(startFromBeat / beatsPerBar) * beatsPerBar;
  const roundedEndBeat = endBeat !== undefined ? Math.ceil(endBeat / beatsPerBar) * beatsPerBar : undefined;
  
  // Convert absolute beats to relative position within the region
  const relativeStartBeat = roundedStartBeat - region.getStartFromBeat();
  const relativeEndBeat = roundedEndBeat !== undefined ? roundedEndBeat - region.getStartFromBeat() : undefined;
  
  // Filter notes based on the rounded range
  const allNotes = region.getNotes();
  let filteredNotes = allNotes.filter(note => note.getStartBeat() >= relativeStartBeat);
  
  // If endBeat is specified, also filter by end range
  if (relativeEndBeat !== undefined) {
    filteredNotes = filteredNotes.filter(note => note.getStartBeat() < relativeEndBeat);
  }
  
  // Generate ABC notation
  const initialKeySignature = getEffectiveKeySignatureAtBeat(project, roundedStartBeat);
  const header = formatABCHeader(region, project, roundedStartBeat);
  const body = formatABCBody(
    filteredNotes,
    relativeStartBeat,
    timeSignature,
    project,
    region.getStartFromBeat(),
    initialKeySignature,
    asCMajor,
  );
  
  return `${header}\n${body}`;
}
