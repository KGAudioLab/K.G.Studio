import { KGCore } from '../core/KGCore';
import { pianoRollIndexToPitch } from './midiUtil';
import type { KeySignature } from '../core/KGProject';

/**
 * Extracts the root note from a key signature string
 * @param keySignature - Key signature like "C major", "F# minor", "Bb major"
 * @returns Root note like "C", "F#", "Bb"
 */
export const getRootNoteFromKeySignature = (keySignature: KeySignature): string => {
  // Extract the note before " major" or " minor"
  const match = keySignature.match(/^([A-G][#b]?)\s+(major|minor)$/);
  if (!match) {
    console.warn(`Invalid key signature format: ${keySignature}, defaulting to C`);
    return 'C';
  }
  return match[1];
};

/**
 * Converts a note name (without octave) to pitch class (0-11)
 * @param noteName - Note name like "C", "C#", "Db", "F#"
 * @returns Pitch class (0=C, 1=C#/Db, 2=D, ..., 11=B)
 */
export const noteNameToPitchClass = (noteName: string): number => {
  const noteMap: { [key: string]: number } = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11
  };

  if (!(noteName in noteMap)) {
    console.warn(`Invalid note name: ${noteName}, defaulting to C (0)`);
    return 0;
  }

  return noteMap[noteName];
};

/**
 * Calculates the pitch classes (0-11) that belong to a scale
 * @param rootNote - Root note like "C", "F#", "Bb"
 * @param modeSteps - Mode interval steps (e.g., [2, 2, 1, 2, 2, 2, 1] for ionian)
 * @returns Array of pitch classes in the scale
 */
export const getScalePitchClasses = (rootNote: string, modeSteps: number[]): number[] => {
  const rootPitchClass = noteNameToPitchClass(rootNote);
  const scalePitchClasses: number[] = [rootPitchClass];

  let currentPitch = rootPitchClass;
  for (const step of modeSteps.slice(0, -1)) { // Exclude last step (returns to root)
    currentPitch = (currentPitch + step) % 12;
    scalePitchClasses.push(currentPitch);
  }

  return scalePitchClasses;
};

/**
 * Gets the mode steps for a given mode id
 * @param modeId - ID of the mode (e.g., "ionian", "aeolian")
 * @returns Array of interval steps, or default ionian if not found
 */
export const getModeSteps = (modeId: string): number[] => {
  const modeData = KGCore.MODE_DATA.find(m => m.id === modeId);
  if (!modeData) {
    console.warn(`Mode not found: ${modeId}, defaulting to ionian`);
    return [2, 2, 1, 2, 2, 2, 1]; // Default to ionian (major scale)
  }
  return modeData.steps;
};

/**
 * Transposes a note name by a given number of semitones
 * @param noteName - Note name like "C", "C#", "Db"
 * @param semitones - Number of semitones to transpose (positive or negative)
 * @returns Transposed note name
 */
const transposeNote = (noteName: string, semitones: number): string => {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pitchClass = noteNameToPitchClass(noteName);
  const newPitchClass = (pitchClass + semitones + 12) % 12;
  return noteNames[newPitchClass];
};

/**
 * Gets the list of suitable chords for a given key, mode, and functional harmony group
 * @param keySignature - Key signature like "C major", "F# minor", "Bb major"
 * @param modeId - Mode ID (e.g., "ionian", "aeolian", "dorian")
 * @param functionType - Functional harmony group: "T" (Tonic), "S" (Subdominant), or "D" (Dominant)
 * @returns Map of chord symbols to their transposed note arrays, e.g., { "I": ["C", "E", "G"], "vi": ["A", "C", "E"] }
 *         Returns empty object if mode or function not found
 *
 * Example:
 * - getSuitableChords("C major", "ionian", "T") returns { "I": ["C", "E", "G"], "vi": ["A", "C", "E"], ... }
 * - getSuitableChords("D major", "ionian", "T") returns { "I": ["D", "F#", "A"], "vi": ["B", "D", "F#"], ... }
 */
export const getSuitableChords = (
  keySignature: KeySignature,
  modeId: string,
  functionType: 'T' | 'S' | 'D'
): Record<string, string[]> => {
  // Get the functional chords for this mode
  const functionalChords = KGCore.FUNCTIONAL_CHORDS_DATA[modeId];
  if (!functionalChords) {
    console.warn(`No functional chords found for mode: ${modeId}`);
    return {};
  }

  // Get the chord symbols for the specified function (T/S/D)
  const chordSymbols = functionalChords[functionType];
  if (!chordSymbols || chordSymbols.length === 0) {
    console.warn(`No chords found for function ${functionType} in mode ${modeId}`);
    return {};
  }

  // Get the mode-specific chords data
  const modeChords = functionalChords.chords;
  if (!modeChords) {
    console.warn(`No chords data found for mode: ${modeId}`);
    return {};
  }

  // Get the root note from key signature
  const rootNote = getRootNoteFromKeySignature(keySignature);

  // Calculate the transposition interval from C to the root note
  const transposeSemitones = noteNameToPitchClass(rootNote);

  // Build a map of chord symbols to transposed notes
  const chordMap: Record<string, string[]> = {};

  for (const chordSymbol of chordSymbols) {
    // Get the chord notes from mode-specific chords data (in C key)
    const chordNotes = modeChords[chordSymbol];
    if (!chordNotes) {
      console.warn(`Chord symbol not found in mode ${modeId} chords: ${chordSymbol}`);
      continue; // Skip this chord if not found
    }

    // If the key is C, use notes as-is; otherwise transpose
    if (rootNote === 'C') {
      chordMap[chordSymbol] = chordNotes;
    } else {
      // Transpose each note in the chord
      const transposedNotes = chordNotes.map(note => transposeNote(note, transposeSemitones));
      chordMap[chordSymbol] = transposedNotes;
    }
  }

  return chordMap;
};

/**
 * Gets the transposed notes for a specific chord in a given key and mode
 * @param chordSymbol - Chord symbol (e.g., "I", "V7", "ii")
 * @param keySignature - Key signature like "C major", "F# minor"
 * @param modeId - Mode ID (e.g., "ionian", "aeolian")
 * @returns Array of note names for the chord in the specified key, or empty array if not found
 */
export const getChordNotesInKey = (
  chordSymbol: string,
  keySignature: KeySignature,
  modeId: string
): string[] => {
  // Get the functional chords for this mode
  const functionalChords = KGCore.FUNCTIONAL_CHORDS_DATA[modeId];
  if (!functionalChords) {
    console.warn(`No functional chords found for mode: ${modeId}`);
    return [];
  }

  // Get the mode-specific chords data
  const modeChords = functionalChords.chords;
  if (!modeChords) {
    console.warn(`No chords data found for mode: ${modeId}`);
    return [];
  }

  // Get the root note from key signature
  const rootNote = getRootNoteFromKeySignature(keySignature);

  // Get the chord notes from mode-specific chords data (in C key)
  const chordNotes = modeChords[chordSymbol];
  if (!chordNotes) {
    console.warn(`Chord symbol not found in mode ${modeId} chords: ${chordSymbol}`);
    return [];
  }

  // If the key is C, return the notes as-is
  if (rootNote === 'C') {
    return chordNotes;
  }

  // Calculate the transposition interval from C to the root note
  const transposeSemitones = noteNameToPitchClass(rootNote);

  // Transpose each note in the chord
  const transposedNotes = chordNotes.map(note => transposeNote(note, transposeSemitones));

  return transposedNotes;
};

/**
 * Generates the CSS background-image string for the piano grid with scale highlighting
 * @param selectedMode - Current mode ID (e.g., "ionian", "dorian")
 * @param keySignature - Current key signature (e.g., "C major", "F# minor")
 * @returns CSS background-image string with highlighted scale notes
 */
export const generatePianoGridBackground = (
  selectedMode: string,
  keySignature: KeySignature
): string => {
  // Get root note and scale pitch classes
  const rootNote = getRootNoteFromKeySignature(keySignature);
  const modeSteps = getModeSteps(selectedMode);
  const scalePitchClasses = getScalePitchClasses(rootNote, modeSteps);

  // Generate horizontal lines for each of 96 rows (8 octaves)
  const horizontalLines = Array.from({ length: 96 }, (_, index) => {
    const pitch = pianoRollIndexToPitch(index);
    const pitchClass = pitch % 12;
    const isInScale = scalePitchClasses.includes(pitchClass);

    // Calculate row positions using CSS calc() with --region-piano-key-height variable
    const rowTop = `calc(var(--region-piano-key-height) * ${index})`;
    const rowBottomMinusOne = `calc(var(--region-piano-key-height) * ${index + 1} - 1px)`;
    const rowBottom = `calc(var(--region-piano-key-height) * ${index + 1})`;

    // For scale notes: highlight the full row with a semi-transparent blue background
    // For non-scale notes: use transparent background with just the separator line
    if (isInScale) {
      return `
        rgba(90, 123, 154, 0.15) ${rowTop},
        rgba(90, 123, 154, 0.15) ${rowBottomMinusOne},
        #3a3a3a ${rowBottomMinusOne},
        #3a3a3a ${rowBottom}
      `.trim();
    } else {
      return `
        transparent ${rowTop},
        transparent ${rowBottomMinusOne},
        #3a3a3a ${rowBottomMinusOne},
        #3a3a3a ${rowBottom}
      `.trim();
    }
  }).join(',\n');

  // Return complete background-image with vertical and horizontal gradients
  // Note: Vertical beat lines gradient should be preserved from existing CSS
  return `
    linear-gradient(to right,
      transparent calc(var(--region-grid-beat-width) - 1px),
      #3a3a3a calc(var(--region-grid-beat-width) - 1px),
      #3a3a3a var(--region-grid-beat-width)
    ),
    linear-gradient(to bottom, ${horizontalLines})
  `;
};
