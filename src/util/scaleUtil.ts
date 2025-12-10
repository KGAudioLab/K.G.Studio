import { KGPianoRollState } from '../core/state/KGPianoRollState';
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
  const modeData = KGPianoRollState.MODE_DATA.find(m => m.id === modeId);
  if (!modeData) {
    console.warn(`Mode not found: ${modeId}, defaulting to ionian`);
    return [2, 2, 1, 2, 2, 2, 1]; // Default to ionian (major scale)
  }
  return modeData.steps;
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
