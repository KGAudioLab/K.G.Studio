import { describe, it, expect } from 'vitest';
import { 
  beatsToBar, 
  convertMidiToProject,
  convertProjectToMidi,
  formatMidiEventLength,
  formatMidiEventPosition,
  MIDI_EVENT_TICKS_PER_BEAT,
  parseMidiEventLength,
  parseMidiEventLengthDelta,
  parseMidiEventPosition,
  parseMidiEventPositionDelta,
  pitchToNoteNameString, 
  pitchToNoteName,
  pianoRollIndexToPitch,
  noteNameToPitch
} from './midiUtil';
import { KGProject } from '../core/KGProject';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';

describe('midiUtil', () => {
  describe('beatsToBar', () => {
    it('should convert beats to bar position object', () => {
      const result1 = beatsToBar(0, { numerator: 4, denominator: 4 });
      expect(result1.bar).toBe(0);
      expect(result1.beatInBar).toBe(0);
      
      const result2 = beatsToBar(4, { numerator: 4, denominator: 4 });
      expect(result2.bar).toBe(1);
      expect(result2.beatInBar).toBe(0);
      
      const result3 = beatsToBar(8, { numerator: 4, denominator: 4 });
      expect(result3.bar).toBe(2);
      expect(result3.beatInBar).toBe(0);
    });

    it('should handle different time signatures', () => {
      const result1 = beatsToBar(0, { numerator: 3, denominator: 4 });
      expect(result1.bar).toBe(0);
      expect(result1.beatInBar).toBe(0);
      
      const result2 = beatsToBar(3, { numerator: 3, denominator: 4 });
      expect(result2.bar).toBe(1);
      expect(result2.beatInBar).toBe(0);
    });

    it('should handle fractional beats', () => {
      const result1 = beatsToBar(2.5, { numerator: 4, denominator: 4 });
      expect(result1.bar).toBe(0);
      expect(result1.beatInBar).toBe(2.5);
      
      const result2 = beatsToBar(4.5, { numerator: 4, denominator: 4 });
      expect(result2.bar).toBe(1);
      expect(result2.beatInBar).toBe(0.5);
    });
  });

  describe('pitchToNoteNameString', () => {
    it('should convert MIDI pitch to note name with octave', () => {
      expect(pitchToNoteNameString(60)).toBe('C4');  // Middle C
      expect(pitchToNoteNameString(61)).toBe('C#4'); // C# above middle C
      expect(pitchToNoteNameString(59)).toBe('B3');  // B below middle C
      expect(pitchToNoteNameString(72)).toBe('C5');  // C one octave above middle C
      expect(pitchToNoteNameString(48)).toBe('C3');  // C one octave below middle C
    });

    it('should handle edge cases', () => {
      expect(pitchToNoteNameString(0)).toBe('C-1');   // Lowest MIDI note
      expect(pitchToNoteNameString(127)).toBe('G9');  // Highest MIDI note
    });

    it('should handle all chromatic notes', () => {
      const expectedNotes = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4'];
      
      for (let i = 0; i < 12; i++) {
        expect(pitchToNoteNameString(60 + i)).toBe(expectedNotes[i]);
      }
    });
  });

  describe('pitchToNoteName', () => {
    it('should convert pitch to note name object', () => {
      const result60 = pitchToNoteName(60); // Middle C
      expect(result60.note).toBe('C');
      expect(result60.octave).toBe(4);
      
      const result61 = pitchToNoteName(61); // C#
      expect(result61.note).toBe('C#');
      expect(result61.octave).toBe(4);
    });

    it('should wrap around for different octaves', () => {
      const result60 = pitchToNoteName(60);
      const result72 = pitchToNoteName(72);
      const result84 = pitchToNoteName(84);
      
      expect(result60.note).toBe('C');
      expect(result72.note).toBe('C');
      expect(result84.note).toBe('C');
      
      expect(result60.octave).toBe(4);
      expect(result72.octave).toBe(5);
      expect(result84.octave).toBe(6);
    });
  });

  describe('pianoRollIndexToPitch', () => {
    it('should convert piano roll row index to MIDI pitch', () => {
      // This function likely maps visual rows to MIDI pitches
      // The exact mapping depends on your implementation
      const result = pianoRollIndexToPitch(10);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(127);
    });

    it('should return different pitches for different indices', () => {
      const pitch1 = pianoRollIndexToPitch(0);
      const pitch2 = pianoRollIndexToPitch(1);
      expect(pitch1).not.toBe(pitch2);
    });
  });

  describe('noteNameToPitch', () => {
    it('should convert note names to MIDI pitch', () => {
      expect(noteNameToPitch('C4')).toBe(60);   // Middle C
      expect(noteNameToPitch('C#4')).toBe(61);  // C# above middle C
      expect(noteNameToPitch('D4')).toBe(62);   // D above middle C
    });

    it('should handle different octaves', () => {
      expect(noteNameToPitch('C3')).toBe(48);   // C below middle C
      expect(noteNameToPitch('C5')).toBe(72);   // C above middle C
    });

    it('should handle sharps', () => {
      expect(noteNameToPitch('C#4')).toBe(61);
      expect(noteNameToPitch('F#4')).toBe(66);
      expect(noteNameToPitch('G#4')).toBe(68);
    });

    it('should handle flats', () => {
      expect(noteNameToPitch('Cb3')).toBe(47);
      expect(noteNameToPitch('Db4')).toBe(61);
      expect(noteNameToPitch('Bb4')).toBe(70);
    });
    
    it('should handle invalid note names', () => {
      expect(() => noteNameToPitch('H4')).toThrow('Invalid note name: H4'); // Invalid note
      expect(() => noteNameToPitch('C')).toThrow('Invalid note name: C'); // Missing octave
    });
  });

  describe('midi event position helpers', () => {
    it('should format event positions with 480 ticks per beat', () => {
      expect(formatMidiEventPosition(0, { numerator: 4, denominator: 4 })).toBe('1 1 0');
      expect(formatMidiEventPosition(1.5, { numerator: 4, denominator: 4 })).toBe('1 2 240');
      expect(formatMidiEventPosition(3.999, { numerator: 4, denominator: 4 }, MIDI_EVENT_TICKS_PER_BEAT)).toBe('2 1 0');
    });

    it('should parse event positions including tick 480 rollover', () => {
      expect(parseMidiEventPosition('4 2 120', { numerator: 4, denominator: 4 })).toEqual({ absoluteBeat: 13.25 });
      expect(parseMidiEventPosition('1 4 480', { numerator: 4, denominator: 4 })).toEqual({ absoluteBeat: 4 });
    });

    it('should parse event position deltas', () => {
      expect(parseMidiEventPositionDelta('+0 1 120', { numerator: 4, denominator: 4 })).toEqual({ deltaBeats: 1.25 });
      expect(parseMidiEventPositionDelta('-1 0 0', { numerator: 4, denominator: 4 })).toEqual({ deltaBeats: -4 });
    });

    it('should reject invalid event positions', () => {
      expect(parseMidiEventPosition('1 5 0', { numerator: 4, denominator: 4 })).toEqual({
        error: 'Beat must be between 1 and 4 for the current time signature.'
      });
    });
  });

  describe('midi event length helpers', () => {
    it('should format midi event lengths with beat and tick', () => {
      expect(formatMidiEventLength(0.5)).toBe('0 240');
      expect(formatMidiEventLength(1)).toBe('1 0');
      expect(formatMidiEventLength(1.5)).toBe('1 240');
    });

    it('should parse midi event lengths including tick 480 rollover', () => {
      expect(parseMidiEventLength('1 240')).toEqual({ duration: 1.5 });
      expect(parseMidiEventLength('0 480')).toEqual({ duration: 1 });
    });

    it('should parse midi event length deltas', () => {
      expect(parseMidiEventLengthDelta('+1 240')).toEqual({ deltaBeats: 1.5 });
      expect(parseMidiEventLengthDelta('-0 120')).toEqual({ deltaBeats: -0.25 });
    });

    it('should reject invalid midi event lengths', () => {
      expect(parseMidiEventLength('0 0')).toEqual({
        error: 'Length must be greater than 0.'
      });
    });
  });

  describe('convertMidiToProject', () => {
    const createRoundTripTrack = (notes: Array<{
      startBeat: number;
      endBeat: number;
      pitch: number;
      velocity: number;
    }>, options?: {
      trackName?: string;
      trackId?: number;
      trackIndex?: number;
      project?: KGProject;
    }) => {
      const project = options?.project ?? new KGProject('Source Project', 64, 0, 132, { numerator: 4, denominator: 4 }, 'D major');
      const track = new KGMidiTrack(options?.trackName ?? 'Lead', options?.trackId ?? 1, 'acoustic_grand_piano');
      track.setTrackIndex(options?.trackIndex ?? project.getTracks().length);
      const region = new KGMidiRegion(
        `region-${options?.trackId ?? 1}`,
        String(track.getId()),
        track.getTrackIndex(),
        `${track.getName()} Source`,
        0,
        Math.max(...notes.map(note => note.endBeat), 0)
      );

      notes.forEach((note, index) => {
        region.addNote(new KGMidiNote(
          `note-${options?.trackId ?? 1}-${index}`,
          note.startBeat,
          note.endBeat,
          note.pitch,
          note.velocity
        ));
      });

      track.addRegion(region);
      project.getTracks().push(track);
      return { project, track };
    };

    const importProject = (project: KGProject) => convertMidiToProject(convertProjectToMidi(project));

    it('imports a short track as a single region covering the full note range', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 1, endBeat: 2.5, pitch: 60, velocity: 96 },
        { startBeat: 6, endBeat: 7, pitch: 64, velocity: 88 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegions = importedTrack.getRegions();

      expect(importedRegions).toHaveLength(1);
      expect(importedRegions[0].getStartFromBeat()).toBe(1);
      expect(importedRegions[0].getLength()).toBe(6);
      expect(importedRegions[0].getNotes()).toHaveLength(2);
      expect(importedRegions[0].getNotes().map(note => note.getStartBeat())).toEqual([0, 5]);
      expect(importedRegions[0].getNotes().map(note => note.getEndBeat())).toEqual([1.5, 6]);
    });

    it('imports a long track as a single region instead of chunking every four bars', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 0, endBeat: 1, pitch: 60, velocity: 100 },
        { startBeat: 20, endBeat: 21, pitch: 64, velocity: 100 },
        { startBeat: 36, endBeat: 37, pitch: 67, velocity: 100 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegions = importedTrack.getRegions();

      expect(importedRegions).toHaveLength(1);
      expect(importedRegions[0].getStartFromBeat()).toBe(0);
      expect(importedRegions[0].getLength()).toBe(37);
      expect(importedRegions[0].getNotes().map(note => note.getStartBeat())).toEqual([0, 20, 36]);
    });

    it('imports multiple MIDI tracks as separate tracks with one region each', () => {
      const project = new KGProject('Ensemble', 64, 0, 110, { numerator: 4, denominator: 4 }, 'G major');
      createRoundTripTrack([
        { startBeat: 0, endBeat: 1, pitch: 60, velocity: 90 },
      ], { project, trackName: 'Lead', trackId: 1, trackIndex: 0 });
      createRoundTripTrack([
        { startBeat: 8, endBeat: 10, pitch: 48, velocity: 80 },
      ], { project, trackName: 'Bass', trackId: 2, trackIndex: 1 });

      const importedProject = importProject(project);
      const importedTracks = importedProject.getTracks() as KGMidiTrack[];

      expect(importedTracks).toHaveLength(2);
      expect(importedTracks[0].getRegions()).toHaveLength(1);
      expect(importedTracks[1].getRegions()).toHaveLength(1);
      expect(importedTracks[0].getRegions()[0].getStartFromBeat()).toBe(0);
      expect(importedTracks[1].getRegions()[0].getStartFromBeat()).toBe(8);
      expect(importedTracks[1].getRegions()[0].getNotes()[0].getStartBeat()).toBe(0);
    });

    it('preserves a note that crosses the old four-bar boundary inside the single imported region', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 15.5, endBeat: 16.5, pitch: 72, velocity: 110 },
        { startBeat: 18, endBeat: 19, pitch: 76, velocity: 105 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegion = importedTrack.getRegions()[0];
      const importedNotes = importedRegion.getNotes();

      expect(importedTrack.getRegions()).toHaveLength(1);
      expect(importedRegion.getStartFromBeat()).toBe(15.5);
      expect(importedRegion.getLength()).toBe(3.5);
      expect(importedNotes[0].getStartBeat()).toBe(0);
      expect(importedNotes[0].getEndBeat()).toBe(1);
      expect(importedNotes[1].getStartBeat()).toBe(2.5);
      expect(importedNotes[1].getEndBeat()).toBe(3.5);
    });

    it('preserves imported tempo, time signature, and key signature metadata', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 2, endBeat: 3, pitch: 60, velocity: 100 },
      ], {
        project: new KGProject('Meta Source', 64, 0, 147, { numerator: 3, denominator: 4 }, 'A major')
      });

      const importedProject = importProject(project);

      expect(importedProject.getBpm()).toBe(147);
      expect(importedProject.getTimeSignature()).toEqual({ numerator: 3, denominator: 4 });
      expect(importedProject.getKeySignature()).toBe('A major');
    });

    it('expands max bars when imported MIDI extends beyond the current project length', () => {
      const existingProject = new KGProject('Existing Project', 8, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
      const sourceProject = new KGProject('Long MIDI Source', 64, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
      createRoundTripTrack([
        { startBeat: 0, endBeat: 1, pitch: 60, velocity: 100 },
        { startBeat: 44, endBeat: 46, pitch: 64, velocity: 100 },
      ], {
        project: sourceProject
      });

      const importedProject = convertMidiToProject(convertProjectToMidi(sourceProject), existingProject);

      expect(importedProject.getMaxBars()).toBe(12);
    });

    it('does not shrink max bars when imported MIDI fits within the current project length', () => {
      const existingProject = new KGProject('Existing Project', 40, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
      const sourceProject = new KGProject('Short MIDI Source', 64, 0, 120, { numerator: 4, denominator: 4 }, 'C major');
      createRoundTripTrack([
        { startBeat: 4, endBeat: 6, pitch: 60, velocity: 100 },
      ], {
        project: sourceProject
      });

      const importedProject = convertMidiToProject(convertProjectToMidi(sourceProject), existingProject);

      expect(importedProject.getMaxBars()).toBe(40);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle negative values gracefully', () => {
      expect(() => pitchToNoteNameString(-1)).not.toThrow();
      expect(() => beatsToBar(-1, { numerator: 4, denominator: 4 })).not.toThrow();
    });

    it('should handle very large values', () => {
      expect(() => pitchToNoteNameString(200)).not.toThrow();
      expect(() => beatsToBar(1000, { numerator: 4, denominator: 4 })).not.toThrow();
    });

    it('should handle zero values', () => {
      expect(pitchToNoteNameString(0)).toBeDefined();
      expect(beatsToBar(0, { numerator: 4, denominator: 4 })).toBeDefined();
    });
  });

  describe('mathematical consistency', () => {
    it('should maintain pitch relationships', () => {
      // One octave = 12 semitones - note names should be the same
      const baseNote = pitchToNoteName(60);
      const octaveNote = pitchToNoteName(72);
      expect(baseNote.note).toBe(octaveNote.note); // Both should be 'C'
      expect(octaveNote.octave).toBe(baseNote.octave + 1); // Octave should be one higher
    });

    it('should maintain beat-to-bar relationships', () => {
      const timeSignature = { numerator: 4, denominator: 4 };
      
      // Should increment bar by 1 for each complete measure
      for (let beat = 0; beat < 20; beat += 4) {
        const expectedBar = Math.floor(beat / 4);
        const result = beatsToBar(beat, timeSignature);
        expect(result.bar).toBe(expectedBar);
        expect(result.beatInBar).toBe(0); // Should be at start of bar
      }
    });

    it('should maintain note name to pitch conversion consistency', () => {
      // Converting pitch to note name and back should be consistent
      const originalPitch = 60;
      const noteObj = pitchToNoteName(originalPitch);
      const noteName = `${noteObj.note}${noteObj.octave}`;
      const convertedPitch = noteNameToPitch(noteName);
      
      expect(convertedPitch).toBe(originalPitch);
    });
  });
});
