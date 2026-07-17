import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('upgradeToV17', () => {
  it('adds neutral transpose defaults and enables no-transpose for legacy percussion tracks', () => {
    const project = new KGProject('Legacy');
    const track = new KGMidiTrack('Legacy drums', 1, 'standard');
    const melodicTrack = new KGMidiTrack('Legacy piano', 2, 'acoustic_grand_piano');
    const region = new KGMidiRegion('region', '1', 0, 'Region', 0, 4);
    track.setRegions([region]);
    track.setNoTranspose(false);
    melodicTrack.setNoTranspose(false);
    project.setTracks([track, melodicTrack]);
    project.setProjectStructureVersion(16);

    upgradeProjectToLatest(project);

    expect(project.getProjectStructureVersion()).toBe(17);
    expect(track.getTransposeSettings()).toEqual({ followKeySignature: false, transpose: 0 });
    expect(track.getNoTranspose()).toBe(true);
    expect(melodicTrack.getNoTranspose()).toBe(false);
    expect(region.getTransposeSettingsOverride()).toBeNull();
  });
});
