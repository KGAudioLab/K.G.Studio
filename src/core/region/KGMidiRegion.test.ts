import { describe, it, expect, beforeEach } from 'vitest'
import { KGMidiRegion } from './KGMidiRegion'
import { KGRegion } from './KGRegion'
import { KGMidiNote } from '../midi/KGMidiNote'
import { createMockMidiNote } from '../../test/utils/mock-data'

describe('KGMidiRegion', () => {
  let region: KGMidiRegion

  beforeEach(() => {
    region = new KGMidiRegion(
      'test-region-1',
      'test-track-1', 
      0,
      'Test Region',
      0,
      4
    )
  })

  describe('constructor', () => {
    it('should create a MIDI region with correct properties', () => {
      const testRegion = new KGMidiRegion(
        'region-1',
        'track-1',
        2,
        'My Region',
        4,
        8
      )

      expect(testRegion.getId()).toBe('region-1')
      expect(testRegion.getTrackId()).toBe('track-1')
      expect(testRegion.getTrackIndex()).toBe(2)
      expect(testRegion.getName()).toBe('My Region')
      expect(testRegion.getStartFromBeat()).toBe(4)
      expect(testRegion.getLength()).toBe(8)
      expect(testRegion.getNotes()).toEqual([])
    })

    it('should use default values for optional parameters', () => {
      const defaultRegion = new KGMidiRegion('region-1', 'track-1', 0, 'Default Region')

      expect(defaultRegion.getStartFromBeat()).toBe(0)
      expect(defaultRegion.getLength()).toBe(0)
      expect(defaultRegion.getNotes()).toEqual([])
    })

    it('should set the correct type identifier', () => {
      expect(region.getCurrentType()).toBe('KGMidiRegion')
    })
  })

  describe('note management', () => {
    let note1: KGMidiNote
    let note2: KGMidiNote
    let note3: KGMidiNote

    beforeEach(() => {
      note1 = createMockMidiNote({ id: 'note-1', pitch: 60, startBeat: 0, endBeat: 1 })
      note2 = createMockMidiNote({ id: 'note-2', pitch: 64, startBeat: 1, endBeat: 2 })
      note3 = createMockMidiNote({ id: 'note-3', pitch: 67, startBeat: 2, endBeat: 3 })
    })

    describe('addNote', () => {
      it('should add a single note to empty region', () => {
        region.addNote(note1)

        const notes = region.getNotes()
        expect(notes).toHaveLength(1)
        expect(notes[0]).toBe(note1)
      })

      it('should add multiple notes to region', () => {
        region.addNote(note1)
        region.addNote(note2)
        region.addNote(note3)

        const notes = region.getNotes()
        expect(notes).toHaveLength(3)
        expect(notes).toContain(note1)
        expect(notes).toContain(note2)
        expect(notes).toContain(note3)
      })

      it('should maintain note order when adding', () => {
        region.addNote(note1)
        region.addNote(note2)
        region.addNote(note3)

        const notes = region.getNotes()
        expect(notes[0]).toBe(note1)
        expect(notes[1]).toBe(note2)
        expect(notes[2]).toBe(note3)
      })

      it('should allow adding the same note multiple times', () => {
        region.addNote(note1)
        region.addNote(note1)

        const notes = region.getNotes()
        expect(notes).toHaveLength(2)
        expect(notes[0]).toBe(note1)
        expect(notes[1]).toBe(note1)
      })
    })

    describe('removeNote', () => {
      beforeEach(() => {
        region.addNote(note1)
        region.addNote(note2)
        region.addNote(note3)
      })

      it('should remove note by ID', () => {
        region.removeNote('note-2')

        const notes = region.getNotes()
        expect(notes).toHaveLength(2)
        expect(notes).toContain(note1)
        expect(notes).toContain(note3)
        expect(notes).not.toContain(note2)
      })

      it('should handle removing non-existent note gracefully', () => {
        const initialLength = region.getNotes().length

        region.removeNote('non-existent-note')

        expect(region.getNotes()).toHaveLength(initialLength)
      })

      it('should remove all instances when note ID appears multiple times', () => {
        // Add another note with same ID as note1
        const duplicateNote = createMockMidiNote({ id: 'note-1', pitch: 72, startBeat: 3, endBeat: 4 })
        region.addNote(duplicateNote)

        expect(region.getNotes()).toHaveLength(4)

        region.removeNote('note-1')

        const notes = region.getNotes()
        expect(notes).toHaveLength(2)
        expect(notes).toContain(note2)
        expect(notes).toContain(note3)
        expect(notes).not.toContain(note1)
        expect(notes).not.toContain(duplicateNote)
      })

      it('should handle removing from empty region', () => {
        const emptyRegion = new KGMidiRegion('empty', 'track', 0, 'Empty Region')
        
        expect(() => emptyRegion.removeNote('note-1')).not.toThrow()
        expect(emptyRegion.getNotes()).toHaveLength(0)
      })
    })

    describe('getNotes', () => {
      it('should return empty array for new region', () => {
        const notes = region.getNotes()
        expect(notes).toEqual([])
        expect(notes).toHaveLength(0)
      })

      it('should return all notes in region', () => {
        region.addNote(note1)
        region.addNote(note2)

        const notes = region.getNotes()
        expect(notes).toHaveLength(2)
        expect(notes).toEqual([note1, note2])
      })

      it('should return a reference to the internal notes array', () => {
        region.addNote(note1)
        const notes1 = region.getNotes()
        const notes2 = region.getNotes()

        expect(notes1).toBe(notes2) // Same reference
      })
    })

    describe('setNotes', () => {
      it('should replace all notes with new array', () => {
        region.addNote(note1)
        region.addNote(note2)

        expect(region.getNotes()).toHaveLength(2)

        region.setNotes([note3])

        const notes = region.getNotes()
        expect(notes).toHaveLength(1)
        expect(notes[0]).toBe(note3)
      })

      it('should allow setting empty notes array', () => {
        region.addNote(note1)
        region.addNote(note2)

        region.setNotes([])

        expect(region.getNotes()).toHaveLength(0)
      })

      it('should accept notes array with multiple notes', () => {
        const newNotes = [note1, note2, note3]
        region.setNotes(newNotes)

        const retrievedNotes = region.getNotes()
        expect(retrievedNotes).toHaveLength(3)
        expect(retrievedNotes).toEqual(newNotes)
      })
    })
  })

  describe('inheritance from KGRegion', () => {
    it('should inherit all base region properties', () => {
      expect(region.getId()).toBe('test-region-1')
      expect(region.getTrackId()).toBe('test-track-1')
      expect(region.getTrackIndex()).toBe(0)
      expect(region.getName()).toBe('Test Region')
      expect(region.getStartFromBeat()).toBe(0)
      expect(region.getLength()).toBe(4)
    })

    it('should inherit selection functionality', () => {
      expect(region.isSelected()).toBe(false)

      region.select()
      expect(region.isSelected()).toBe(true)

      region.deselect()
      expect(region.isSelected()).toBe(false)
    })

    it('should inherit setters from base class', () => {
      region.setName('Updated Region')
      expect(region.getName()).toBe('Updated Region')

      region.setStartFromBeat(8)
      expect(region.getStartFromBeat()).toBe(8)

      region.setLength(12)
      expect(region.getLength()).toBe(12)
    })
  })

  describe('type identification', () => {
    it('should return correct current type', () => {
      expect(region.getCurrentType()).toBe('KGMidiRegion')
    })

    it('should return correct root type', () => {
      expect(region.getRootType()).toBe('KGRegion')
    })

    it('should be instanceof both KGMidiRegion and KGRegion', () => {
      expect(region).toBeInstanceOf(KGMidiRegion)
      expect(region).toBeInstanceOf(KGRegion)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle notes with overlapping time ranges', () => {
      const overlappingNote1 = createMockMidiNote({ id: 'overlap-1', pitch: 60, startBeat: 0, endBeat: 2 })
      const overlappingNote2 = createMockMidiNote({ id: 'overlap-2', pitch: 64, startBeat: 1, endBeat: 3 })

      region.addNote(overlappingNote1)
      region.addNote(overlappingNote2)

      const notes = region.getNotes()
      expect(notes).toHaveLength(2)
      expect(notes).toContain(overlappingNote1)
      expect(notes).toContain(overlappingNote2)
    })

    it('should handle notes with same pitch but different timing', () => {
      const sameNote1 = createMockMidiNote({ id: 'same-1', pitch: 60, startBeat: 0, endBeat: 1 })
      const sameNote2 = createMockMidiNote({ id: 'same-2', pitch: 60, startBeat: 2, endBeat: 3 })

      region.addNote(sameNote1)
      region.addNote(sameNote2)

      expect(region.getNotes()).toHaveLength(2)
    })

    it('should handle notes outside region boundaries', () => {
      // Region is from beat 0 to 4, but note extends beyond
      const outsideNote = createMockMidiNote({ id: 'outside', pitch: 60, startBeat: 3, endBeat: 6 })

      region.addNote(outsideNote)

      const notes = region.getNotes()
      expect(notes).toHaveLength(1)
      expect(notes[0]).toBe(outsideNote)
      // Note: The region doesn't enforce boundary constraints - that's application logic
    })

    it('should handle zero-length region', () => {
      const zeroRegion = new KGMidiRegion('zero', 'track', 0, 'Zero Length', 0, 0)
      const note = createMockMidiNote({ id: 'note', pitch: 60, startBeat: 0, endBeat: 1 })

      zeroRegion.addNote(note)

      expect(zeroRegion.getNotes()).toHaveLength(1)
      expect(zeroRegion.getLength()).toBe(0)
    })
  })

  describe('data consistency', () => {
    it('should maintain note references correctly', () => {
      const originalNote = createMockMidiNote({ id: 'ref-test', pitch: 60, startBeat: 0, endBeat: 1 })
      
      region.addNote(originalNote)
      const retrievedNote = region.getNotes()[0]

      expect(retrievedNote).toBe(originalNote) // Same reference
      
      // Modify original note
      originalNote.setPitch(64)
      expect(retrievedNote.getPitch()).toBe(64) // Should reflect change
    })

    it('should handle concurrent modifications correctly', () => {
      const notes = [
        createMockMidiNote({ id: 'concurrent-1', pitch: 60 }),
        createMockMidiNote({ id: 'concurrent-2', pitch: 64 }),
        createMockMidiNote({ id: 'concurrent-3', pitch: 67 })
      ]

      // Add notes
      notes.forEach(note => region.addNote(note))
      expect(region.getNotes()).toHaveLength(3)

      // Remove middle note
      region.removeNote('concurrent-2')
      expect(region.getNotes()).toHaveLength(2)

      // Add new note
      const newNote = createMockMidiNote({ id: 'concurrent-4', pitch: 70 })
      region.addNote(newNote)
      expect(region.getNotes()).toHaveLength(3)

      // Verify final state
      const finalNotes = region.getNotes()
      expect(finalNotes).toContain(notes[0]) // concurrent-1
      expect(finalNotes).not.toContain(notes[1]) // concurrent-2 (removed)
      expect(finalNotes).toContain(notes[2]) // concurrent-3  
      expect(finalNotes).toContain(newNote) // concurrent-4
    })
  })
})