/**
 * Mathematical utility functions for KGSP
 * Contains common mathematical algorithms and calculations
 */

import type { TimeSignature } from '../types/projectTypes';

// MIDI timing constants
const TICKS_PER_QUARTER_NOTE = 480;

/**
 * Calculate Greatest Common Divisor (GCD) using Euclidean algorithm
 * @param a - First number
 * @param b - Second number
 * @returns GCD of a and b
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

/**
 * Convert beats to MIDI ticks based on time signature
 * @param beats - Duration in beats
 * @param timeSignature - Project time signature
 * @returns Duration in MIDI ticks
 */
export function beatsToTicks(beats: number, timeSignature: TimeSignature): number {
  // In different time signatures, the beat unit changes:
  // 4/4: 1 beat = quarter note = 480 ticks
  // 4/8: 1 beat = eighth note = 240 ticks
  // 6/8: 1 beat = eighth note = 240 ticks
  const ticksPerBeat = TICKS_PER_QUARTER_NOTE * (4 / timeSignature.denominator);
  return Math.round(beats * ticksPerBeat);
}

/**
 * Convert MIDI ticks to beats based on time signature
 * @param ticks - Duration in MIDI ticks
 * @param timeSignature - Project time signature
 * @returns Duration in beats
 */
export function ticksToBeats(ticks: number, timeSignature: TimeSignature): number {
  const ticksPerBeat = TICKS_PER_QUARTER_NOTE * (4 / timeSignature.denominator);
  return ticks / ticksPerBeat;
}

/**
 * Calculate ticks per bar based on time signature
 * @param timeSignature - Project time signature
 * @returns Number of ticks in one bar
 */
export function getTicksPerBar(timeSignature: TimeSignature): number {
  const beatsPerBar = timeSignature.numerator;
  const beatUnit = 4 / timeSignature.denominator; // Quarter note units per beat
  return beatsPerBar * beatUnit * TICKS_PER_QUARTER_NOTE;
}

/**
 * Reduce a fraction to its lowest terms using GCD
 * @param numerator - Fraction numerator
 * @param denominator - Fraction denominator
 * @returns Object with reduced numerator and denominator
 */
export function reduceFraction(numerator: number, denominator: number): { numerator: number; denominator: number } {
  const commonDivisor = gcd(numerator, denominator);
  return {
    numerator: numerator / commonDivisor,
    denominator: denominator / commonDivisor
  };
}

/**
 * Check if a number is an integer within a small tolerance (for floating point precision)
 * @param value - Number to check
 * @param tolerance - Tolerance for floating point comparison (default: 1e-10)
 * @returns True if the number is effectively an integer
 */
export function isEffectivelyInteger(value: number, tolerance: number = 1e-10): boolean {
  return Math.abs(value - Math.round(value)) < tolerance;
}