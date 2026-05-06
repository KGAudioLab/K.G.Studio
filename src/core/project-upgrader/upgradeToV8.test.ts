import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGAudioTrack } from '../track/KGAudioTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGAudioRegion } from '../region/KGAudioRegion';
import { KGMidiNote } from '../midi/KGMidiNote';
import { KGMidiPitchBend } from '../midi/KGMidiPitchBend';
import { upgradeToV8 } from './upgradeToV8';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

function makeLegacyMidiRegion(id: string): KGMidiRegion {
  const region = new KGMidiRegion(id, 'track-1', 0, 'Legacy MIDI', 0, 4);
  region.addNote(new KGMidiNote('note-1', 0, 1, 60, 100));
  delete (region as unknown as { pitchBends?: KGMidiPitchBend[] }).pitchBends;
  return region;
}

describe('upgradeToV8', () => {
  it('initializes missing pitch bend arrays on midi regions', () => {
    const midiTrack = new KGMidiTrack('MIDI Track', 0);
    const midiRegion = makeLegacyMidiRegion('midi-region-1');
    midiTrack.setRegions([midiRegion]);

    const audioTrack = new KGAudioTrack('Audio Track', 1);
    const audioRegion = new KGAudioRegion('audio-region-1', 'track-2', 1, 'Audio', 0, 4);
    audioTrack.setRegions([audioRegion]);

    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, undefined, [midiTrack, audioTrack], 7);

    upgradeToV8(project);

    expect(midiRegion.getNotes()).toHaveLength(1);
    expect(midiRegion.getPitchBends()).toEqual([]);
    expect(audioTrack.getRegions()[0]).toBe(audioRegion);
    expect(project.getProjectStructureVersion()).toBe(8);
  });

  it('preserves existing pitch bends', () => {
    const midiTrack = new KGMidiTrack('MIDI Track', 0);
    const midiRegion = new KGMidiRegion('midi-region-1', 'track-1', 0, 'MIDI', 0, 4);
    midiRegion.addPitchBend(new KGMidiPitchBend('bend-1', 0.5, 12288));
    midiTrack.setRegions([midiRegion]);
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, undefined, [midiTrack], 7);

    upgradeToV8(project);

    expect(midiRegion.getPitchBends()).toHaveLength(1);
    expect(midiRegion.getPitchBends()[0].getValue()).toBe(12288);
  });

  it('upgrades legacy projects through the main upgrader path', () => {
    const midiTrack = new KGMidiTrack('MIDI Track', 0);
    const midiRegion = makeLegacyMidiRegion('midi-region-1');
    midiTrack.setRegions([midiRegion]);
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, undefined, [midiTrack], 7);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(8);
    expect((upgraded.getTracks()[0].getRegions()[0] as KGMidiRegion).getPitchBends()).toEqual([]);
  });
});
