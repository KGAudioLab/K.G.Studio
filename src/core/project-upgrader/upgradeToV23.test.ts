import { instanceToPlain, plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { getInstVelaRegions } from '../../util/instvela/regionScore';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('AI Strings articulation persistence', () => {
  it('migrates legacy switches on AI tracks and preserves their note-on behavior in the render score', () => {
    const project = new KGProject('Legacy strings');
    const ai = new KGMidiTrack('AI Violin', 1, 'ai_violin');
    const regular = new KGMidiTrack('Violin', 2, 'violin');
    const aiRegion = new KGMidiRegion('ai', '1', 0, 'AI part', 0, 960);
    aiRegion.setNotes([
      new KGMidiNote('sustain', 0, 120, 60),
      new KGMidiNote('spiccato', 120, 240, 61),
      new KGMidiNote('switch-to-spiccato', 120, 170, 37),
      new KGMidiNote('switch-to-pizzicato', 240, 290, 38),
      new KGMidiNote('pizzicato', 360, 480, 62),
      new KGMidiNote('switch-to-spiccato-again', 480, 530, 37),
      new KGMidiNote('legacy-sustain-switch', 480, 530, 39),
      new KGMidiNote('back-to-sustain', 480, 600, 63),
    ]);
    const regularRegion = new KGMidiRegion('regular', '2', 1, 'Regular part', 0, 960);
    regularRegion.addNote(new KGMidiNote('low-note', 0, 120, 37));
    ai.addRegion(aiRegion);
    regular.addRegion(regularRegion);
    project.setTracks([ai, regular]);

    const saved = instanceToPlain(project);
    saved.projectStructureVersion = 22;
    for (const track of saved.tracks) {
      for (const note of track.regions[0].notes) delete note.articulation;
    }
    const restored = upgradeProjectToLatest(plainToInstance(KGProject, saved));
    const [restoredAi, restoredRegular] = restored.getTracks() as KGMidiTrack[];
    expect(restoredAi.getRegions()[0].getNotes().map(note => [note.getPitch(), note.getArticulation()]))
      .toEqual([[60, 0], [61, 1], [62, 2], [63, 0]]);
    expect(restoredRegular.getRegions()[0].getNotes().map(note => [note.getPitch(), note.getArticulation()]))
      .toEqual([[37, 0]]);
    expect(getInstVelaRegions(restored)[0].request.score.notes.map(note => note.articulation))
      .toEqual(['sustain', 'spiccato', 'pizzicato', 'sustain']);
    expect(restored.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
  });

  it('round-trips numeric articulations and treats former keyswitch pitches as notes in current projects', () => {
    const project = new KGProject('Note articulations');
    const track = new KGMidiTrack('AI Cello', 1, 'ai_cello');
    const region = new KGMidiRegion('ai', '1', 0, 'AI part', 0, 960);
    region.addNote(new KGMidiNote('low-pizzicato', 0, 240, 25, 90, 2));
    region.addNote(new KGMidiNote('reserved-tremolo', 240, 480, 48, 90, 3));
    track.addRegion(region);
    project.setTracks([track]);

    const saved = instanceToPlain(project);
    expect(saved.tracks[0].regions[0].notes.map((note: { articulation: number }) => note.articulation)).toEqual([2, 3]);
    const restored = upgradeProjectToLatest(plainToInstance(KGProject, structuredClone(saved)));
    expect(instanceToPlain(restored).tracks[0].regions[0].notes).toEqual(saved.tracks[0].regions[0].notes);
    expect(getInstVelaRegions(restored)[0].request.score.notes.map(note => [note.pitch, note.articulation]))
      .toEqual([[25, 'pizzicato'], [48, 'sustain']]);
  });
});
