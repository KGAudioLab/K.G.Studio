import { describe, expect, it } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGProject } from '../KGProject';
import { KGPianoRollState } from '../state/KGPianoRollState';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('upgradeToV19', () => {
  it('defaults fresh projects to Music Assistant and no piano-roll snapping', () => {
    const project = new KGProject();

    expect(project.getProjectStructureVersion()).toBe(19);
    expect(project.getRightPanel()).toBe('musicAssistant');
    expect(project.getPianoRollSnapping()).toBe('none');
  });

  it.each(Array.from({ length: 19 }, (_, version) => version))(
    'upgrades a v%i project to the legacy defaults',
    (version) => {
      const legacy = plainToInstance(KGProject, {
        ...instanceToPlain(new KGProject('Legacy')),
        projectStructureVersion: version,
        rightPanel: undefined,
        pianoRollSnapping: undefined,
      });

      upgradeProjectToLatest(legacy);

      expect(legacy.getProjectStructureVersion()).toBe(19);
      expect(legacy.getRightPanel()).toBe('musicAssistant');
      expect(legacy.getPianoRollSnapping()).toBe('none');
    },
  );

  it.each([
    'musicGenerator',
    'musicAssistant',
    'eventList',
    null,
  ] as const)('serializes and restores the %s right-panel state', (rightPanel) => {
    const project = new KGProject('Saved');
    project.setRightPanel(rightPanel);

    const restored = plainToInstance(KGProject, instanceToPlain(project));
    upgradeProjectToLatest(restored);

    expect(restored.getRightPanel()).toBe(rightPanel);
  });

  it.each(KGPianoRollState.SNAP_OPTIONS.map(({ value }) => value))(
    'serializes and restores piano-roll snapping %s',
    (snapping) => {
      const project = new KGProject('Saved');
      project.setPianoRollSnapping(snapping);

      const restored = plainToInstance(KGProject, instanceToPlain(project));
      upgradeProjectToLatest(restored);

      expect(restored.getPianoRollSnapping()).toBe(snapping);
    },
  );
});
