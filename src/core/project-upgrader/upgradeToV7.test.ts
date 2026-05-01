import { describe, it, expect, beforeEach } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { upgradeToV7 } from './upgradeToV7';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';

function makeProject(volumes: number[]): KGProject {
  const tracks = volumes.map((v, i) => {
    const track = new KGMidiTrack(`Track ${i}`, i);
    // Bypass setVolume clamping to simulate old 0–1 linear values stored in JSON
    (track as unknown as { volume: number }).volume = v;
    return track;
  });
  const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, undefined, tracks, 6);
  return project;
}

describe('upgradeToV7', () => {
  it('converts 1.0 linear to 0 dB', () => {
    const project = makeProject([1.0]);
    upgradeToV7(project);
    expect(project.getTracks()[0].getVolume()).toBeCloseTo(0, 5);
  });

  it('converts 0.8 linear to ~−1.94 dB', () => {
    const project = makeProject([0.8]);
    upgradeToV7(project);
    expect(project.getTracks()[0].getVolume()).toBeCloseTo(20 * Math.log10(0.8), 3);
  });

  it('converts 0.5 linear to ~−6.02 dB', () => {
    const project = makeProject([0.5]);
    upgradeToV7(project);
    expect(project.getTracks()[0].getVolume()).toBeCloseTo(-6.021, 2);
  });

  it('converts 0.0 linear to MIN_TRACK_VOLUME_DB', () => {
    const project = makeProject([0.0]);
    upgradeToV7(project);
    expect(project.getTracks()[0].getVolume()).toBe(AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB);
  });

  it('clamps values that exceed MAX_TRACK_VOLUME_DB', () => {
    // linear > 1.0 would give positive dB; cap at +6
    const project = makeProject([2.0]);
    upgradeToV7(project);
    expect(project.getTracks()[0].getVolume()).toBe(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB);
  });

  it('bumps project structure version to 7', () => {
    const project = makeProject([1.0]);
    upgradeToV7(project);
    expect(project.getProjectStructureVersion()).toBe(7);
  });

  it('handles multiple tracks independently', () => {
    const project = makeProject([1.0, 0.5, 0.0]);
    upgradeToV7(project);
    const tracks = project.getTracks();
    expect(tracks[0].getVolume()).toBeCloseTo(0, 5);
    expect(tracks[1].getVolume()).toBeCloseTo(-6.021, 2);
    expect(tracks[2].getVolume()).toBe(AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB);
  });
});
