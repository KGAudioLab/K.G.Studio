/**
 * Time utility functions for KGSP
 */

import { TIME_CONSTANTS } from '../constants/coreConstants';
import type { TimeSignature } from '../types/projectTypes';

/**
 * Parse and validate time signature string in format "numerator/denominator"
 * @param timeSignatureStr - String in format "numerator/denominator" (e.g., "4/4", "3/4", "6/8")
 * @returns TimeSignature object if valid, null if invalid
 */
export function parseTimeSignature(timeSignatureStr: string): TimeSignature | null {
  // Remove any whitespace and check format
  const trimmed = timeSignatureStr.trim();
  
  // Check if it contains exactly one slash
  const parts = trimmed.split('/');
  if (parts.length !== 2) {
    return null;
  }
  
  // Parse numerator and denominator
  const numerator = parseInt(parts[0]);
  const denominator = parseInt(parts[1]);
  
  // Check if both are valid numbers
  if (isNaN(numerator) || isNaN(denominator)) {
    return null;
  }
  
  // Validate against available values
  if (!TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_NUMERATORS.includes(numerator)) {
    return null;
  }
  
  if (!TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_DENOMINATORS.includes(denominator)) {
    return null;
  }
  
  return { numerator, denominator };
}

/**
 * Get formatted error message for invalid time signature
 * @returns User-friendly error message with available options
 */
export function getTimeSignatureErrorMessage(): string {
  const numerators = TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_NUMERATORS.join(', ');
  const denominators = TIME_CONSTANTS.AVAILABLE_TIME_SIGNATURE_DENOMINATORS.join(', ');
  
  return `Invalid time signature format. Please use "numerator/denominator" format.\n\nAvailable numerators: ${numerators}\nAvailable denominators: ${denominators}\n\nExamples: 4/4, 3/4, 6/8, 12/8`;
}

/**
 * Convert beats to combined bar/beat and time format (BBB:B | mm:ss:mmm)
 * @param beats - Current position in beats
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature object with numerator and denominator
 * @returns Formatted time string in BBB:B | mm:ss:mmm format
 */
export function beatsToTimeString(
  beats: number, 
  bpm: number, 
  timeSignature: { numerator: number; denominator: number }
): string {
  // Calculate bar and beat information
  const beatsPerBar = timeSignature.numerator;
  const currentBar = Math.floor(beats / beatsPerBar) + 1; // 1-indexed bars
  const beatInBar = Math.floor(beats % beatsPerBar) + 1; // 1-indexed beats within bar
  
  // Calculate total seconds from beats for time display
  const totalSeconds = (beats / bpm) * 60;
  
  // Extract minutes, seconds, and milliseconds
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);
  
  // Format bar/beat part
  const BBB = currentBar.toString().padStart(3, '0');
  const B = beatInBar.toString();
  
  // Format time part with leading zeros
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');
  
  return `${BBB}:${B} | ${mm}:${ss}:${mmm}`;
} 