import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV14 } from './upgradeToV14';

describe('upgradeToV14', () => {
  it('marks projects as upgraded even when no signature regions exist yet', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 13, 1, []);

    upgradeToV14(project);

    expect(project.getProjectStructureVersion()).toBe(14);
    expect(project.getGlobalTracks()).toHaveLength(4);
  });

  it('runs through the main upgrader path', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 13, 1, []);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
  });
});
