import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV15 } from './upgradeToV15';

describe('upgradeToV15', () => {
  it('marks projects as upgraded and preserves default global tracks', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 14, 1, []);

    upgradeToV15(project);

    expect(project.getProjectStructureVersion()).toBe(15);
    expect(project.getGlobalTracks()).toHaveLength(4);
  });

  it('runs through the main upgrader path', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 14, 1, []);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
  });
});
