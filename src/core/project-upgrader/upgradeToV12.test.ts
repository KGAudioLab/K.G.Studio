import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV12 } from './upgradeToV12';

describe('upgradeToV12', () => {
  it('initializes missing zoom levels to 1', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 11);
    delete (project as unknown as { barWidthMultiplier?: unknown }).barWidthMultiplier;
    delete (project as unknown as { pianoRollZoom?: unknown }).pianoRollZoom;

    upgradeToV12(project);

    expect(project.getBarWidthMultiplier()).toBe(1);
    expect(project.getPianoRollZoom()).toBe(1);
    expect(project.getProjectStructureVersion()).toBe(12);
  });

  it('preserves existing zoom levels', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 4, [], 11, 6);

    upgradeToV12(project);

    expect(project.getBarWidthMultiplier()).toBe(4);
    expect(project.getPianoRollZoom()).toBe(6);
  });

  it('upgrades legacy projects through the main upgrader path', () => {
    const project = new KGProject('Legacy', 32, 0, 125, undefined, undefined, undefined, undefined, [0, 0], 1, [], 11);
    delete (project as unknown as { barWidthMultiplier?: unknown }).barWidthMultiplier;
    delete (project as unknown as { pianoRollZoom?: unknown }).pianoRollZoom;

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
    expect(upgraded.getBarWidthMultiplier()).toBe(1);
    expect(upgraded.getPianoRollZoom()).toBe(1);
  });
});
