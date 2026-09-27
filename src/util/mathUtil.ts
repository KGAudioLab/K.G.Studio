/**
 * Mathematical utility functions for KGSP
 * Contains common mathematical algorithms and calculations
 */

import type { TimeSignature } from '../types/projectTypes';
import {
  ticksPerBar as getTimelineTicksPerBar,
} from '../core/timing';

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
 * Calculate ticks per bar based on time signature
 * @param timeSignature - Project time signature
 * @returns Number of ticks in one bar
 */
export function getTicksPerBar(timeSignature: TimeSignature): number {
  return getTimelineTicksPerBar(timeSignature);
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
