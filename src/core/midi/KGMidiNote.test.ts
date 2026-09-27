import { describe, it, expect, beforeEach } from 'vitest';
import { KGMidiNote } from './KGMidiNote';

describe('KGMidiNote', () => {
  let note: KGMidiNote;

  beforeEach(() => {
    note = new KGMidiNote('test-note', 0, 1, 60, 80);
  });

  describe('constructor', () => {
    it('should create a note with correct properties', () => {
      const testNote = new KGMidiNote('note-1', 2, 4, 72, 100);
      
      expect(testNote.getId()).toBe('note-1');
      expect(testNote.getStartTick()).toBe(2);
      expect(testNote.getEndTick()).toBe(4);
      expect(testNote.getPitch()).toBe(72);
      expect(testNote.getVelocity()).toBe(100);
    });

    it('should use default values when not provided', () => {
      const defaultNote = new KGMidiNote('default-note');
      
      expect(defaultNote.getId()).toBe('default-note');
      expect(defaultNote.getStartTick()).toBe(0);
      expect(defaultNote.getEndTick()).toBe(0);
      expect(defaultNote.getPitch()).toBe(0);
      expect(defaultNote.getVelocity()).toBe(127);
    });
  });

  describe('getters and setters', () => {
    it('should round and store an integer start tick', () => {
      expect(note.getStartTick()).toBe(0);
      
      note.setStartTick(1.5);
      expect(note.getStartTick()).toBe(2);
    });

    it('should round and store an integer end tick', () => {
      expect(note.getEndTick()).toBe(1);
      
      note.setEndTick(3.5);
      expect(note.getEndTick()).toBe(4);
    });

    it('should get and set pitch', () => {
      expect(note.getPitch()).toBe(60);
      
      note.setPitch(72);
      expect(note.getPitch()).toBe(72);
    });

    it('should get and set velocity', () => {
      expect(note.getVelocity()).toBe(80);
      
      note.setVelocity(100);
      expect(note.getVelocity()).toBe(100);
    });

    it('should get and set ID', () => {
      expect(note.getId()).toBe('test-note');
      
      note.setId('new-id');
      expect(note.getId()).toBe('new-id');
    });
  });

  describe('selection', () => {
    it('should start unselected', () => {
      expect(note.isSelected()).toBe(false);
    });

    it('should select and deselect', () => {
      note.select();
      expect(note.isSelected()).toBe(true);
      
      note.deselect();
      expect(note.isSelected()).toBe(false);
    });
  });

  describe('note duration', () => {
    it('should calculate duration correctly', () => {
      const durationNote = new KGMidiNote('duration-test', 1, 3, 60, 80);
      expect(durationNote.getEndTick() - durationNote.getStartTick()).toBe(2);
    });

    it('should handle zero duration', () => {
      const zeroDurationNote = new KGMidiNote('zero-duration', 2, 2, 60, 80);
      expect(zeroDurationNote.getEndTick() - zeroDurationNote.getStartTick()).toBe(0);
    });
  });

  describe('pitch validation', () => {
    it('should accept valid MIDI pitch range', () => {
      // MIDI pitch range is typically 0-127
      note.setPitch(0);
      expect(note.getPitch()).toBe(0);
      
      note.setPitch(127);
      expect(note.getPitch()).toBe(127);
      
      note.setPitch(60); // Middle C
      expect(note.getPitch()).toBe(60);
    });
  });

  describe('velocity validation', () => {
    it('should accept valid MIDI velocity range', () => {
      // MIDI velocity range is typically 0-127
      note.setVelocity(0);
      expect(note.getVelocity()).toBe(0);
      
      note.setVelocity(127);
      expect(note.getVelocity()).toBe(127);
      
      note.setVelocity(64); // Mid velocity
      expect(note.getVelocity()).toBe(64);
    });
  });

  describe('clone and comparison', () => {
    it('should create independent instances', () => {
      const note1 = new KGMidiNote('note-1', 0, 1, 60, 80);
      const note2 = new KGMidiNote('note-2', 0, 1, 60, 80);
      
      expect(note1.getId()).not.toBe(note2.getId());
      
      note1.setPitch(72);
      expect(note2.getPitch()).toBe(60); // Should remain unchanged
    });
  });

  describe('edge cases', () => {
    it('should handle negative start beat', () => {
      note.setStartTick(-1);
      expect(note.getStartTick()).toBe(-1);
    });

    it('should handle start beat after end beat', () => {
      note.setStartTick(5);
      note.setEndTick(2);
      
      expect(note.getStartTick()).toBe(5);
      expect(note.getEndTick()).toBe(2);
      // Note: The class might need validation logic to prevent this
    });
  });
});
