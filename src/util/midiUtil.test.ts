import { describe, it, expect } from 'vitest'
import { 
  beatsToBar, 
  pitchToNoteNameString, 
  pitchToNoteName,
  pianoRollIndexToPitch,
  noteNameToPitch
} from './midiUtil'

describe('midiUtil', () => {
  describe('beatsToBar', () => {
    it('should convert beats to bar position object', () => {
      const result1 = beatsToBar(0, { numerator: 4, denominator: 4 })
      expect(result1.bar).toBe(0)
      expect(result1.beatInBar).toBe(0)
      
      const result2 = beatsToBar(4, { numerator: 4, denominator: 4 })
      expect(result2.bar).toBe(1)
      expect(result2.beatInBar).toBe(0)
      
      const result3 = beatsToBar(8, { numerator: 4, denominator: 4 })
      expect(result3.bar).toBe(2)
      expect(result3.beatInBar).toBe(0)
    })

    it('should handle different time signatures', () => {
      const result1 = beatsToBar(0, { numerator: 3, denominator: 4 })
      expect(result1.bar).toBe(0)
      expect(result1.beatInBar).toBe(0)
      
      const result2 = beatsToBar(3, { numerator: 3, denominator: 4 })
      expect(result2.bar).toBe(1)
      expect(result2.beatInBar).toBe(0)
    })

    it('should handle fractional beats', () => {
      const result1 = beatsToBar(2.5, { numerator: 4, denominator: 4 })
      expect(result1.bar).toBe(0)
      expect(result1.beatInBar).toBe(2.5)
      
      const result2 = beatsToBar(4.5, { numerator: 4, denominator: 4 })
      expect(result2.bar).toBe(1)
      expect(result2.beatInBar).toBe(0.5)
    })
  })

  describe('pitchToNoteNameString', () => {
    it('should convert MIDI pitch to note name with octave', () => {
      expect(pitchToNoteNameString(60)).toBe('C4')  // Middle C
      expect(pitchToNoteNameString(61)).toBe('C#4') // C# above middle C
      expect(pitchToNoteNameString(59)).toBe('B3')  // B below middle C
      expect(pitchToNoteNameString(72)).toBe('C5')  // C one octave above middle C
      expect(pitchToNoteNameString(48)).toBe('C3')  // C one octave below middle C
    })

    it('should handle edge cases', () => {
      expect(pitchToNoteNameString(0)).toBe('C-1')   // Lowest MIDI note
      expect(pitchToNoteNameString(127)).toBe('G9')  // Highest MIDI note
    })

    it('should handle all chromatic notes', () => {
      const expectedNotes = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4']
      
      for (let i = 0; i < 12; i++) {
        expect(pitchToNoteNameString(60 + i)).toBe(expectedNotes[i])
      }
    })
  })

  describe('pitchToNoteName', () => {
    it('should convert pitch to note name object', () => {
      const result60 = pitchToNoteName(60) // Middle C
      expect(result60.note).toBe('C')
      expect(result60.octave).toBe(4)
      
      const result61 = pitchToNoteName(61) // C#
      expect(result61.note).toBe('C#')
      expect(result61.octave).toBe(4)
    })

    it('should wrap around for different octaves', () => {
      const result60 = pitchToNoteName(60)
      const result72 = pitchToNoteName(72)
      const result84 = pitchToNoteName(84)
      
      expect(result60.note).toBe('C')
      expect(result72.note).toBe('C')
      expect(result84.note).toBe('C')
      
      expect(result60.octave).toBe(4)
      expect(result72.octave).toBe(5)
      expect(result84.octave).toBe(6)
    })
  })

  describe('pianoRollIndexToPitch', () => {
    it('should convert piano roll row index to MIDI pitch', () => {
      // This function likely maps visual rows to MIDI pitches
      // The exact mapping depends on your implementation
      const result = pianoRollIndexToPitch(10)
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(127)
    })

    it('should return different pitches for different indices', () => {
      const pitch1 = pianoRollIndexToPitch(0)
      const pitch2 = pianoRollIndexToPitch(1)
      expect(pitch1).not.toBe(pitch2)
    })
  })

  describe('noteNameToPitch', () => {
    it('should convert note names to MIDI pitch', () => {
      expect(noteNameToPitch('C4')).toBe(60)   // Middle C
      expect(noteNameToPitch('C#4')).toBe(61)  // C# above middle C
      expect(noteNameToPitch('D4')).toBe(62)   // D above middle C
    })

    it('should handle different octaves', () => {
      expect(noteNameToPitch('C3')).toBe(48)   // C below middle C
      expect(noteNameToPitch('C5')).toBe(72)   // C above middle C
    })

    it('should handle sharps', () => {
      expect(noteNameToPitch('C#4')).toBe(61)
      expect(noteNameToPitch('F#4')).toBe(66)
      expect(noteNameToPitch('G#4')).toBe(68)
    })
    
    it('should handle invalid note names', () => {
      expect(() => noteNameToPitch('Db4')).toThrow('Invalid note name: Db4') // Flats not supported
      expect(() => noteNameToPitch('H4')).toThrow('Invalid note name: H4') // Invalid note
      expect(() => noteNameToPitch('C')).toThrow('Invalid note name: C') // Missing octave
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle negative values gracefully', () => {
      expect(() => pitchToNoteNameString(-1)).not.toThrow()
      expect(() => beatsToBar(-1, { numerator: 4, denominator: 4 })).not.toThrow()
    })

    it('should handle very large values', () => {
      expect(() => pitchToNoteNameString(200)).not.toThrow()
      expect(() => beatsToBar(1000, { numerator: 4, denominator: 4 })).not.toThrow()
    })

    it('should handle zero values', () => {
      expect(pitchToNoteNameString(0)).toBeDefined()
      expect(beatsToBar(0, { numerator: 4, denominator: 4 })).toBeDefined()
    })
  })

  describe('mathematical consistency', () => {
    it('should maintain pitch relationships', () => {
      // One octave = 12 semitones - note names should be the same
      const baseNote = pitchToNoteName(60)
      const octaveNote = pitchToNoteName(72)
      expect(baseNote.note).toBe(octaveNote.note) // Both should be 'C'
      expect(octaveNote.octave).toBe(baseNote.octave + 1) // Octave should be one higher
    })

    it('should maintain beat-to-bar relationships', () => {
      const timeSignature = { numerator: 4, denominator: 4 }
      
      // Should increment bar by 1 for each complete measure
      for (let beat = 0; beat < 20; beat += 4) {
        const expectedBar = Math.floor(beat / 4)
        const result = beatsToBar(beat, timeSignature)
        expect(result.bar).toBe(expectedBar)
        expect(result.beatInBar).toBe(0) // Should be at start of bar
      }
    })

    it('should maintain note name to pitch conversion consistency', () => {
      // Converting pitch to note name and back should be consistent
      const originalPitch = 60
      const noteObj = pitchToNoteName(originalPitch)
      const noteName = `${noteObj.note}${noteObj.octave}`
      const convertedPitch = noteNameToPitch(noteName)
      
      expect(convertedPitch).toBe(originalPitch)
    })
  })
})