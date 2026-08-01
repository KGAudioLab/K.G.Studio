import { describe, expect, it } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('upgradeToV18', () => {
  it('defaults fresh v18 projects to enabled beat snapping', () => {
    const project = new KGProject();

    expect(project.getProjectStructureVersion()).toBe(18);
    expect(project.getIsSnappingEnabled()).toBe(true);
    expect(project.getSnappingMode()).toBe('beat');
  });

  it.each(Array.from({ length: 18 }, (_, version) => version))(
    'upgrades a v%i project without snapping properties to enabled bar snapping',
    (version) => {
      const legacy = plainToInstance(KGProject, {
        ...instanceToPlain(new KGProject('Legacy')),
        projectStructureVersion: version,
        isSnappingEnabled: undefined,
        snappingMode: undefined,
      });

      upgradeProjectToLatest(legacy);

      expect(legacy.getProjectStructureVersion()).toBe(18);
      expect(legacy.getIsSnappingEnabled()).toBe(true);
      expect(legacy.getSnappingMode()).toBe('bar');
    }
  );

  it('serializes and restores v18 snapping settings without running migration', () => {
    const project = new KGProject('Saved');
    project.setIsSnappingEnabled(false);
    project.setSnappingMode('bar');

    const restored = plainToInstance(KGProject, instanceToPlain(project));
    upgradeProjectToLatest(restored);

    expect(restored.getIsSnappingEnabled()).toBe(false);
    expect(restored.getSnappingMode()).toBe('bar');
  });
});
