import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { GlobalTrackType } from '../global-track';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV13 } from './upgradeToV13';

describe('upgradeToV13', () => {
  it('adds the default global tracks to legacy projects', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 12, 1, []);

    upgradeToV13(project);

    expect(project.getProjectStructureVersion()).toBe(13);
    expect(project.getGlobalTracks()).toHaveLength(4);
    expect(project.getGlobalTracks().map(track => track.getType())).toEqual([
      GlobalTrackType.Marker,
      GlobalTrackType.Tempo,
      GlobalTrackType.Signature,
      GlobalTrackType.Chord,
    ]);
  });

  it('runs through the main upgrader path', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 12, 1, []);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
    expect(upgraded.getGlobalTracks()).toHaveLength(4);
  });
});
