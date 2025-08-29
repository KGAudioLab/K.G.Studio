/**
 * ABC Notation conversion utilities for KGSP
 * Converts MIDI regions to ABC notation format
 */

import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGCore } from '../core/KGCore';
import { KGProject } from '../core/KGProject';
import { pitchToNoteName } from './midiUtil';
import { beatsToTicks, getTicksPerBar, reduceFraction } from './mathUtil';
import type { TimeSignature } from '../types/projectTypes';
import { KEY_SIGNATURE_MAP } from '../constants/coreConstants';

// MIDI timing constants
const TICKS_PER_QUARTER_NOTE = 480;
const TICKS_PER_SIXTEENTH_NOTE = TICKS_PER_QUARTER_NOTE / 4; // 120 ticks

/**
 * ABC Note data structure for processing
 */
interface ABCNote {
  pitch: string[]; // ABC notation pitch array (C, D, E, F, G, A, B, with ^ for sharp, z for rest) - supports polyphonic notes
  startTick: number; // Start time in MIDI ticks
  endTick: number; // End time in MIDI ticks
  tieWithNext: boolean; // Whether this note should be tied to the next note
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
function midiPitchToABCNote(pitch: number): string {
  const { note, octave } = pitchToNoteName(pitch);
  
  // ABC notation uses different octave conventions:
  // C4 (middle C) is represented as "C"
  // C5 is "c", C6 is "c'", C7 is "c''"
  // C3 is "C,", C2 is "C,," etc.
  
  const baseNote = note.replace('#', '^'); // Convert sharp to ABC sharp notation
  
  if (octave >= 4) {
    if (octave === 4) {
      return baseNote; // C4 -> C
    } else if (octave === 5) {
      return baseNote.toLowerCase(); // C5 -> c
    } else {
      // C6+ -> c', c'', c'''
      const apostrophes = "'".repeat(octave - 5);
      return baseNote.toLowerCase() + apostrophes;
    }
  } else {
    // C3 and below -> C,, C,,, etc.
    const commas = ",".repeat(4 - octave);
    return baseNote + commas;
  }
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
function formatABCHeader(region: KGMidiRegion, project: KGProject): string {
  const timeSignature = project.getTimeSignature();
  const bpm = project.getBpm();
  const keySignature = project.getKeySignature();
  const regionName = region.getName();
  
  // Get ABC notation key signature from the key signature map
  const abcKeySignature = KEY_SIGNATURE_MAP[keySignature]?.abcNotationKeySignature || 'C';
  
  const header = [
    'X:1', // Reference number
    `T:${regionName}`, // Title
    `M:${timeSignature.numerator}/${timeSignature.denominator}`, // Time signature
    `L:1/${timeSignature.denominator}`, // note length unit should be aligned with time signature
    `Q:1/${timeSignature.denominator}=${bpm}`, // Tempo (quarter note = BPM)
    `K:${abcKeySignature}` // Key signature from project settings
  ];
  
  return header.join('\n');
}

/**
 * Format ABC notation body with notes
 * @param notes - Array of MIDI notes to convert
 * @param relativeStartBeat - Start position relative to region
 * @param timeSignature - Project time signature
 * @returns ABC body string
 */
function formatABCBody(notes: KGMidiNote[], relativeStartBeat: number, timeSignature: TimeSignature): string {
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
    
    // Get ABC pitch notation
    const abcPitch = midiPitchToABCNote(note.getPitch());
    
    abcNotes.push({
      pitch: [abcPitch],
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
      currentNote.pitch.push(...nextNote.pitch);
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
        pitch: ['z'],
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
        pitch: ['z'],
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
          pitch: currentNote.pitch,
          startTick: noteStartInBar,
          endTick: noteEndInBar,
          tieWithNext: !isLastPart && currentNote.pitch[0] !== 'z' // Don't tie rests
        });
      }
    }
  }

  // Step 7: Generate ABC notation output with bar lines and ties
  const abcStrings: string[] = [];
  
  for (let i = 0; i < splitNotes.length; i++) {
    const note = splitNotes[i];
    const duration = note.endTick - note.startTick;
    const lengthString = convertTicksToABCLength(duration, timeSignature);
    
    // Build note string with length - handle polyphonic notes
    let noteString: string;
    if (note.pitch.length === 1) {
      // Single note
      noteString = `${note.pitch[0]}${lengthString}`;
    } else {
      // Polyphonic note (chord) - use ABC chord notation [C E G]
      const chordNotes = note.pitch.join(' ');
      noteString = `[${chordNotes}]${lengthString}`;
    }
    
    // Add tie if needed
    if (note.tieWithNext) {
      noteString += '-';
    }
    
    abcStrings.push(noteString);
    
    // Check if we've reached the end of a bar
    const currentBarIndex = Math.floor((note.startTick - relativeStartTicks) / ticksPerBar);
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
export function convertRegionToABCNotation(region: KGMidiRegion, startFromBeat: number, endBeat?: number): string {
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
  const header = formatABCHeader(region, project);
  const body = formatABCBody(filteredNotes, relativeStartBeat, timeSignature);
  
  return `${header}\n${body}`;
}