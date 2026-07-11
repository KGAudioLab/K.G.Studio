import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { KGMidiTrack } from '../core/track/KGMidiTrack';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGChordTrack } from '../core/global-track/KGChordTrack';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { buildIntelligentArpeggiatorPlan } from './intelligentArpeggiator';

describe('buildIntelligentArpeggiatorPlan', () => {
  it('learns a C pattern and maps it to D minor without the imported bass root', () => {
    const track = new KGMidiTrack('Output', 1);
    const region = new KGMidiRegion('output-region', '1', 0, 'Example', 0, 8);
    [
      [0, 60], [1, 67], [2, 64], [3, 67],
    ].forEach(([start, pitch], index) => region.addNote(new KGMidiNote(`n${index}`, start, start + 1, pitch, 90 + index)));
    track.setRegions([region]);
    const chords = new KGChordTrack();
    chords.setRegions([
      new KGChordRegion('c', 'global-chord', 0, 'C', 0, 4),
      new KGChordRegion('dm', 'global-chord', 0, 'Dm', 4, 4),
    ]);
    const project = new KGProject('Test', 2, 0, 120, { numerator: 4, denominator: 4 }, 'C major', 'ionian', false, [0, 0], 1, [track], 16, 1, [chords]);

    const result = buildIntelligentArpeggiatorPlan(project, region, 0, { source: { type: 'chord' }, exampleBars: 1, generateBars: 1, tieBreak: 'higher' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.notes.map(note => [note.startBeat, note.pitch, note.velocity])).toEqual([
      [4, 62, 90], [5, 69, 91], [6, 65, 92], [7, 69, 93],
    ]);
  });
});
