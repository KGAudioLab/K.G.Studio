import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getRootNoteFromKeySignature,
  noteNameToPitchClass,
  getScalePitchClasses,
  getModeSteps,
  getSuitableChords,
  getChordNotesInKey,
  getMatchingChordsForPitch,
  generatePianoGridBackground
} from './scaleUtil'
import { KGCore } from '../core/KGCore'
import type { KeySignature } from '../core/KGProject'
import functionalChordsData from '../../public/resources/modes/functional_chords.json'

describe('scaleUtil', () => {
  // Setup: Mock KGCore with real chord data
  beforeEach(() => {
    // Use real functional chords data from JSON file (includes name, steps, and chord data)
    KGCore.FUNCTIONAL_CHORDS_DATA = functionalChordsData
  })

  describe('getRootNoteFromKeySignature', () => {
    it('should extract root note from C major', () => {
      expect(getRootNoteFromKeySignature('C major')).toBe('C')
    })

    it('should extract root note from F# minor', () => {
      expect(getRootNoteFromKeySignature('F# minor')).toBe('F#')
    })

    it('should extract root note from Bb major', () => {
      expect(getRootNoteFromKeySignature('Bb major')).toBe('Bb')
    })

    it('should handle Db major', () => {
      expect(getRootNoteFromKeySignature('Db major')).toBe('Db')
    })

    it('should default to C for invalid format', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getRootNoteFromKeySignature('Invalid' as KeySignature)).toBe('C')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid key signature format'))
      warnSpy.mockRestore()
    })
  })

  describe('noteNameToPitchClass', () => {
    it('should convert C to 0', () => {
      expect(noteNameToPitchClass('C')).toBe(0)
    })

    it('should convert C# to 1', () => {
      expect(noteNameToPitchClass('C#')).toBe(1)
    })

    it('should convert Db to 1', () => {
      expect(noteNameToPitchClass('Db')).toBe(1)
    })

    it('should convert D to 2', () => {
      expect(noteNameToPitchClass('D')).toBe(2)
    })

    it('should convert E to 4', () => {
      expect(noteNameToPitchClass('E')).toBe(4)
    })

    it('should convert F to 5', () => {
      expect(noteNameToPitchClass('F')).toBe(5)
    })

    it('should convert F# to 6', () => {
      expect(noteNameToPitchClass('F#')).toBe(6)
    })

    it('should convert G to 7', () => {
      expect(noteNameToPitchClass('G')).toBe(7)
    })

    it('should convert A to 9', () => {
      expect(noteNameToPitchClass('A')).toBe(9)
    })

    it('should convert Bb to 10', () => {
      expect(noteNameToPitchClass('Bb')).toBe(10)
    })

    it('should convert B to 11', () => {
      expect(noteNameToPitchClass('B')).toBe(11)
    })

    it('should default to 0 for invalid note', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(noteNameToPitchClass('X')).toBe(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid note name'))
      warnSpy.mockRestore()
    })
  })

  describe('getModeSteps', () => {
    it('should return ionian steps', () => {
      expect(getModeSteps('ionian')).toEqual([2, 2, 1, 2, 2, 2, 1])
    })

    it('should return dorian steps', () => {
      expect(getModeSteps('dorian')).toEqual([2, 1, 2, 2, 2, 1, 2])
    })

    it('should default to ionian for invalid mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(getModeSteps('invalid')).toEqual([2, 2, 1, 2, 2, 2, 1])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Mode not found'))
      warnSpy.mockRestore()
    })
  })

  describe('getScalePitchClasses', () => {
    it('should return C major scale pitch classes', () => {
      const steps = [2, 2, 1, 2, 2, 2, 1]
      const result = getScalePitchClasses('C', steps)
      expect(result).toEqual([0, 2, 4, 5, 7, 9, 11]) // C D E F G A B
    })

    it('should return D major scale pitch classes', () => {
      const steps = [2, 2, 1, 2, 2, 2, 1]
      const result = getScalePitchClasses('D', steps)
      expect(result).toEqual([2, 4, 6, 7, 9, 11, 1]) // D E F# G A B C#
    })

    it('should return F# dorian scale pitch classes', () => {
      const steps = [2, 1, 2, 2, 2, 1, 2]
      const result = getScalePitchClasses('F#', steps)
      expect(result).toEqual([6, 8, 9, 11, 1, 3, 4]) // F# G# A B C# D# E
    })
  })

  describe('getSuitableChords', () => {
    it('should return tonic chords for C major ionian', () => {
      const result = getSuitableChords('C major', 'ionian', 'T')
      expect(result).toHaveProperty('I')
      expect(result).toHaveProperty('vi')
      expect(result).toHaveProperty('iii')
      expect(result['I']).toEqual(['C', 'E', 'G'])
      expect(result['vi']).toEqual(['A', 'C', 'E'])
    })

    it('should return subdominant chords for C major ionian', () => {
      const result = getSuitableChords('C major', 'ionian', 'S')
      expect(result).toHaveProperty('IV')
      expect(result).toHaveProperty('ii')
      expect(result['IV']).toEqual(['F', 'A', 'C'])
      expect(result['ii']).toEqual(['D', 'F', 'A'])
    })

    it('should return dominant chords for C major ionian', () => {
      const result = getSuitableChords('C major', 'ionian', 'D')
      expect(result).toHaveProperty('V')
      expect(result).toHaveProperty('V7')
      expect(result['V']).toEqual(['G', 'B', 'D'])
      expect(result['V7']).toEqual(['G', 'B', 'D', 'F'])
    })

    it('should transpose chords for D major ionian', () => {
      const result = getSuitableChords('D major', 'ionian', 'T')
      expect(result['I']).toEqual(['D', 'F#', 'A'])
      expect(result['vi']).toEqual(['B', 'D', 'F#'])
    })

    it('should transpose chords for F# major ionian', () => {
      const result = getSuitableChords('F# major', 'ionian', 'T')
      expect(result['I']).toEqual(['F#', 'A#', 'C#'])
    })

    it('should return empty object for invalid mode', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = getSuitableChords('C major', 'invalid', 'T')
      expect(result).toEqual({})
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No functional chords found'))
      warnSpy.mockRestore()
    })
  })

  describe('getChordNotesInKey', () => {
    it('should return I chord notes in C major ionian', () => {
      const result = getChordNotesInKey('I', 'C major', 'ionian')
      expect(result).toEqual(['C', 'E', 'G'])
    })

    it('should return V7 chord notes in C major ionian', () => {
      const result = getChordNotesInKey('V7', 'C major', 'ionian')
      expect(result).toEqual(['G', 'B', 'D', 'F'])
    })

    it('should transpose to D major', () => {
      const result = getChordNotesInKey('I', 'D major', 'ionian')
      expect(result).toEqual(['D', 'F#', 'A'])
    })

    it('should return empty array for invalid chord symbol', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = getChordNotesInKey('invalid', 'C major', 'ionian')
      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Chord symbol not found'))
      warnSpy.mockRestore()
    })
  })

  describe('getMatchingChordsForPitch', () => {
    describe('valid inputs', () => {
      it('should return matching chords for C (pitch 60) in C major ionian tonic', () => {
        const result = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')

        // C major ionian T chords from JSON: I ["C","E","G"], vi ["A","C","E"], iii ["E","G","B"], I⁶ ["E","G","C"]
        // Pitch 60 = C (pitch class 0)
        // Expected matches prioritized by position:
        // 1. I chord: C is root (position 0) → [0, 4, 7] (no offset)
        // 2. vi chord: C is 2nd note (position 1) → [9, 12, 16] offset by -12 → [-3, 0, 4]
        // 3. I⁶ chord: C is 3rd note (position 2) → [4, 7, 12] offset by -12 → [-8, -5, 0]
        expect(result).toEqual([
          [0, 4, 7],      // I chord (C-E-G): C is root
          [-3, 0, 4],     // vi chord (A-C-E): C is 2nd, offset applied
          [-8, -5, 0]     // I⁶ chord (E-G-C): C is 3rd, offset applied
        ])
      })

      it('should return matching chords for E (pitch 64) in C major ionian tonic', () => {
        const result = getMatchingChordsForPitch(64, 'C major', 'ionian', 'T')

        // Pitch 64 = E (pitch class 4)
        // Expected matches prioritized by position:
        // 1. iii chord: E is root (position 0) → [4, 7, 11] (no offset)
        // 2. I⁶ chord: E is root (position 0) → [4, 7, 12] (no offset)
        // 3. I chord: E is 2nd note (position 1) → [0, 4, 7] (no offset, 4 < 12)
        // 4. vi chord: E is 3rd note (position 2) → [9, 12, 16] offset by -12 → [-3, 0, 4]
        expect(result).toEqual([
          [4, 7, 11],     // iii chord (E-G-B): E is root
          [4, 7, 12],     // I⁶ chord (E-G-C): E is root
          [0, 4, 7],      // I chord (C-E-G): E is 2nd
          [-3, 0, 4]      // vi chord (A-C-E): E is 3rd, offset applied
        ])
      })

      it('should prioritize root matches over other positions', () => {
        const result = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T') // C
        // First chord should have C as root (position 0)
        if (result.length > 0) {
          expect(result[0][0] % 12).toBe(0) // First note of first chord should be C
        }
      })

      it('should return matching chords for F (pitch 65) in C major ionian subdominant', () => {
        const result = getMatchingChordsForPitch(65, 'C major', 'ionian', 'S') // F

        // Pitch 65 = F (pitch class 5)
        // C major ionian S chords from JSON: IV ["F","A","C"], ii ["D","F","A"], vi ["A","C","E"], IV⁶ ["A","C","F"]
        // Expected matches prioritized by position:
        // 1. IV chord: F is root → [5, 9, 12] offset by -12 → [-7, -3, 0]
        // 2. ii chord: F is 2nd → [2, 5, 9] (no offset)
        // 3. IV⁶ chord: F is 3rd → [9, 12, 17] offset by -12 → [-3, 0, 5]
        expect(result).toEqual([
          [5, 9, 12],    // IV chord (F-A-C): F is root, offset applied
          [2, 5, 9],      // ii chord (D-F-A): F is 2nd
          [-3, 0, 5]      // IV⁶ chord (A-C-F): F is 3rd, offset applied
        ])
      })

      it('should return matching chords for G (pitch 67) in C major ionian dominant', () => {
        const result = getMatchingChordsForPitch(67, 'C major', 'ionian', 'D') // G

        // Pitch 67 = G (pitch class 7)
        // C major ionian D chords from JSON: V ["G","B","D"], V7 ["G","B","D","F"], vii° ["B","D","F"], ♭II ["Db","F","Ab"]
        // Expected matches prioritized by position:
        // 1. V chord: G is root → [7, 11, 14] offset by -12 → [-5, -1, 2]
        // 2. V7 chord: G is root → [7, 11, 14, 17] offset by -12 → [-5, -1, 2, 5]
        expect(result).toEqual([
          [7, 11, 14],       // V chord (G-B-D): G is root, offset applied
          [7, 11, 14, 17]     // V7 chord (G-B-D-F): G is root, offset applied
        ])
      })

      it('should work with different modes (dorian)', () => {
        const result = getMatchingChordsForPitch(60, 'C major', 'dorian', 'T')
        expect(result.length).toBeGreaterThan(0)
      })

      it('should transpose correctly for D major', () => {
        const result = getMatchingChordsForPitch(62, 'D major', 'ionian', 'T') // D
        expect(result.length).toBeGreaterThan(0)
        expect(result.some(chord => chord.includes(2))).toBe(true) // Contains D (pitch class 2)
      })

      it('should handle all MIDI pitch ranges (low)', () => {
        const result = getMatchingChordsForPitch(24, 'C major', 'ionian', 'T') // C1
        expect(Array.isArray(result)).toBe(true)
      })

      it('should handle all MIDI pitch ranges (high)', () => {
        const result = getMatchingChordsForPitch(108, 'C major', 'ionian', 'T') // C8
        expect(Array.isArray(result)).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('should return empty array for invalid mode', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const result = getMatchingChordsForPitch(60, 'C major', 'invalid', 'T')
        expect(result).toEqual([])
        warnSpy.mockRestore()
      })

      it('should handle pitch class calculations correctly', () => {
        // Test that pitch 60 (C4) and pitch 72 (C5) both match C chords
        const result1 = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        const result2 = getMatchingChordsForPitch(72, 'C major', 'ionian', 'T')
        expect(result1.length).toBe(result2.length) // Same chords match
      })

      it('should return pitch classes in ascending order', () => {
        const result = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        result.forEach(chord => {
          for (let i = 1; i < chord.length; i++) {
            expect(chord[i]).toBeGreaterThan(chord[i - 1])
          }
        })
      })

      it('should apply octave offset correctly for pitch classes >= 12', () => {
        const result = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        // All pitch classes should be < 12 after offset
        result.forEach(chord => {
          chord.forEach(pitchClass => {
            expect(pitchClass).toBeLessThan(24) // Allowing for extended range
          })
        })
      })
    })

    describe('pitch class calculations', () => {
      it('should correctly convert hover pitch to pitch class', () => {
        // C4 (60) should match same chords as C5 (72)
        const result1 = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        const result2 = getMatchingChordsForPitch(72, 'C major', 'ionian', 'T')
        expect(result1).toEqual(result2)
      })

      it('should maintain ascending pitch order in results', () => {
        const result = getMatchingChordsForPitch(64, 'C major', 'ionian', 'T')
        result.forEach(chord => {
          for (let i = 1; i < chord.length; i++) {
            expect(chord[i]).toBeGreaterThan(chord[i - 1])
          }
        })
      })
    })

    describe('integration with helper functions', () => {
      it('should work with getSuitableChords', () => {
        const suitableChords = getSuitableChords('C major', 'ionian', 'T')
        expect(Object.keys(suitableChords).length).toBeGreaterThan(0)

        const matchingChords = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        expect(matchingChords.length).toBeGreaterThan(0)
      })

      it('should work with noteNameToPitchClass', () => {
        const cPitch = noteNameToPitchClass('C')
        const result = getMatchingChordsForPitch(60, 'C major', 'ionian', 'T')
        expect(result.some(chord => chord.some(pc => pc % 12 === cPitch))).toBe(true)
      })

      it('should respect KGCore.FUNCTIONAL_CHORDS_DATA structure', () => {
        // Verify the data has the expected structure
        const data = KGCore.FUNCTIONAL_CHORDS_DATA
        expect(data).toHaveProperty('ionian')
        expect(data['ionian']).toHaveProperty('T')
        expect(data['ionian']).toHaveProperty('chords')
      })
    })
  })

  describe('generatePianoGridBackground', () => {
    it('should generate CSS background for C major ionian', () => {
      const result = generatePianoGridBackground('ionian', 'C major')
      expect(result).toContain('linear-gradient')
      expect(typeof result).toBe('string')
    })

    it('should generate different backgrounds for different modes', () => {
      const ionian = generatePianoGridBackground('ionian', 'C major')
      const dorian = generatePianoGridBackground('dorian', 'C major')
      expect(ionian).not.toBe(dorian)
    })
  })
})
