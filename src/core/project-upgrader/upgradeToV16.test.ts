import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV16 } from './upgradeToV16';

describe('upgradeToV16', () => {
  it('defaults persisted UI/audio toggles to false for legacy projects', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 15, 1, []);

    upgradeToV16(project);

    expect(project.getProjectStructureVersion()).toBe(16);
    expect(project.getShowGlobalTracks()).toBe(false);
    expect(project.getIsMetronomeEnabled()).toBe(false);
  });

  it('preserves existing persisted toggle values through the main upgrader path', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 15, 1, [], true, true);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
    expect(upgraded.getShowGlobalTracks()).toBe(true);
    expect(upgraded.getIsMetronomeEnabled()).toBe(true);
  });
});
