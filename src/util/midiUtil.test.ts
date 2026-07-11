import { describe, it, expect } from 'vitest';
import { 
  beatsToBar, 
  convertMidiToProject,
  convertProjectToMidi,
  convertRegionToMidi,
  convertTrackToMidi,
  formatMidiEventLength,
  formatMidiEventPosition,
  MIDI_EVENT_TICKS_PER_BEAT,
  parseMidiEventLength,
  parseMidiEventLengthDelta,
  parseMidiImportData,
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
  describe('focused MIDI export', () => {
    it('exports only the selected region and rebases its containing bar while retaining its beat offset', () => {
      const track = new KGMidiTrack('Piano', 1);
      const selectedRegion = new KGMidiRegion('region-a', '1', 0, 'Verse', 10, 4);
      selectedRegion.addNote(new KGMidiNote('note-a', 0, 1, 60, 100));
      const excludedRegion = new KGMidiRegion('region-b', '1', 0, 'Chorus', 20, 4);
      excludedRegion.addNote(new KGMidiNote('note-b', 0, 1, 67, 100));
      track.setRegions([selectedRegion, excludedRegion]);
      const project = new KGProject('Export Test', 32, 0, 120, { numerator: 4, denominator: 4 }, 'C major', 'ionian', false, [0, 0], 1, [track]);

      const parsed = parseMidiImportData(convertRegionToMidi(project, track, selectedRegion));

      expect(parsed.tracks).toHaveLength(1);
      expect(parsed.tracks[0].notes).toEqual([
        expect.objectContaining({ pitch: 60, startBeat: 2, endBeat: 3 }),
      ]);
    });

    it('exports all and only the selected track regions without rebasing their timeline positions', () => {
      const track = new KGMidiTrack('Piano', 1);
      const firstRegion = new KGMidiRegion('region-a', '1', 0, 'Verse', 4, 4);
      firstRegion.addNote(new KGMidiNote('note-a', 0, 1, 60, 100));
      const secondRegion = new KGMidiRegion('region-b', '1', 0, 'Chorus', 12, 4);
      secondRegion.addNote(new KGMidiNote('note-b', 1, 2, 67, 100));
      track.setRegions([firstRegion, secondRegion]);
      const project = new KGProject('Export Test', 32, 0, 120, { numerator: 4, denominator: 4 }, 'C major', 'ionian', false, [0, 0], 1, [track]);

      const parsed = parseMidiImportData(convertTrackToMidi(project, track));

      expect(parsed.tracks).toHaveLength(1);
      expect(parsed.tracks[0].notes).toEqual([
        expect.objectContaining({ pitch: 60, startBeat: 4, endBeat: 5 }),
        expect.objectContaining({ pitch: 67, startBeat: 13, endBeat: 14 }),
      ]);
    });
  });

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
    const getImportedMidiRegion = (track: KGMidiTrack, index = 0): KGMidiRegion => (
      track.getRegions()[index] as KGMidiRegion
    );

    it('imports a short track as a single region covering the full note range', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 1, endBeat: 2.5, pitch: 60, velocity: 96 },
        { startBeat: 6, endBeat: 7, pitch: 64, velocity: 88 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegion = getImportedMidiRegion(importedTrack);

      expect(importedTrack.getRegions()).toHaveLength(1);
      expect(importedRegion.getStartFromBeat()).toBe(1);
      expect(importedRegion.getLength()).toBe(6);
      expect(importedRegion.getNotes()).toHaveLength(2);
      expect(importedRegion.getNotes().map((note: KGMidiNote) => note.getStartBeat())).toEqual([0, 5]);
      expect(importedRegion.getNotes().map((note: KGMidiNote) => note.getEndBeat())).toEqual([1.5, 6]);
    });

    it('imports a long track as a single region instead of chunking every four bars', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 0, endBeat: 1, pitch: 60, velocity: 100 },
        { startBeat: 20, endBeat: 21, pitch: 64, velocity: 100 },
        { startBeat: 36, endBeat: 37, pitch: 67, velocity: 100 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegion = getImportedMidiRegion(importedTrack);

      expect(importedTrack.getRegions()).toHaveLength(1);
      expect(importedRegion.getStartFromBeat()).toBe(0);
      expect(importedRegion.getLength()).toBe(37);
      expect(importedRegion.getNotes().map((note: KGMidiNote) => note.getStartBeat())).toEqual([0, 20, 36]);
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
      expect(getImportedMidiRegion(importedTracks[0]).getStartFromBeat()).toBe(0);
      expect(getImportedMidiRegion(importedTracks[1]).getStartFromBeat()).toBe(8);
      expect(getImportedMidiRegion(importedTracks[1]).getNotes()[0].getStartBeat()).toBe(0);
    });

    it('preserves a note that crosses the old four-bar boundary inside the single imported region', () => {
      const { project } = createRoundTripTrack([
        { startBeat: 15.5, endBeat: 16.5, pitch: 72, velocity: 110 },
        { startBeat: 18, endBeat: 19, pitch: 76, velocity: 105 },
      ]);

      const importedProject = importProject(project);
      const importedTrack = importedProject.getTracks()[0] as KGMidiTrack;
      const importedRegion = getImportedMidiRegion(importedTrack);
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

  describe('parseMidiImportData', () => {
    const createImportProject = () => new KGProject('Import Source', 32, 0, 120, { numerator: 4, denominator: 4 }, 'C major');

    it('returns a single note-bearing track with original timing and suggested instrument', () => {
      const project = createImportProject();
      const track = new KGMidiTrack('Flute Lead', 1, 'flute');
      track.setTrackIndex(0);
      const region = new KGMidiRegion('region-1', '1', 0, 'Lead Region', 4, 6);
      region.addNote(new KGMidiNote('note-1', 0, 1, 72, 100));
      region.addNote(new KGMidiNote('note-2', 4, 6, 76, 90));
      track.addRegion(region);
      project.getTracks().push(track);

      const parsed = parseMidiImportData(convertProjectToMidi(project));

      expect(parsed.fileStartBeat).toBe(4);
      expect(parsed.tracks).toHaveLength(1);
      expect(parsed.tracks[0]).toMatchObject({
        name: 'Flute Lead',
        suggestedInstrument: 'flute',
        startBeat: 4,
        endBeat: 10,
      });
      expect(parsed.tracks[0].notes.map(note => note.startBeat)).toEqual([4, 8]);
    });

    it('preserves per-track timing and skips empty tracks', () => {
      const project = createImportProject();
      const emptyTrack = new KGMidiTrack('Empty', 1, 'violin');
      emptyTrack.setTrackIndex(0);

      const leadTrack = new KGMidiTrack('Lead', 2, 'clarinet');
      leadTrack.setTrackIndex(1);
      const leadRegion = new KGMidiRegion('lead-region', '2', 1, 'Lead Region', 4, 2);
      leadRegion.addNote(new KGMidiNote('lead-note', 0, 1, 67, 95));
      leadTrack.addRegion(leadRegion);

      const bassTrack = new KGMidiTrack('Bass', 3, 'electric_bass_finger');
      bassTrack.setTrackIndex(2);
      const bassRegion = new KGMidiRegion('bass-region', '3', 2, 'Bass Region', 6, 4);
      bassRegion.addNote(new KGMidiNote('bass-note', 0, 2, 43, 100));
      bassTrack.addRegion(bassRegion);

      project.getTracks().push(emptyTrack, leadTrack, bassTrack);

      const parsed = parseMidiImportData(convertProjectToMidi(project));

      expect(parsed.fileStartBeat).toBe(4);
      expect(parsed.tracks).toHaveLength(2);
      expect(parsed.tracks.map(track => track.name)).toEqual(['Lead', 'Bass']);
      expect(parsed.tracks.map(track => track.startBeat)).toEqual([4, 6]);
      expect(parsed.tracks.map(track => track.endBeat)).toEqual([5, 8]);
      expect(parsed.tracks.map(track => track.suggestedInstrument)).toEqual(['clarinet', 'electric_bass_finger']);
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
