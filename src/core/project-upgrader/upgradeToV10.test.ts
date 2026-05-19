import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGTrack } from '../track/KGTrack';
import { KGTrackAutomationPoint } from '../track/KGTrackAutomationPoint';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV10 } from './upgradeToV10';

describe('upgradeToV10', () => {
  it('initializes missing track automation arrays on legacy tracks', () => {
    const track = new KGTrack('Legacy Track', 1);
    delete (track as unknown as { volumeAutomation?: unknown }).volumeAutomation;
    delete (track as unknown as { panAutomation?: unknown }).panAutomation;
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 9);

    upgradeToV10(project);

    expect(track.getVolumeAutomation()).toEqual([]);
    expect(track.getPanAutomation()).toEqual([]);
    expect(project.getProjectStructureVersion()).toBe(10);
  });

  it('preserves existing track automation points through the main upgrader path', () => {
    const track = new KGTrack('Legacy Track', 1);
    track.setVolumeAutomation([new KGTrackAutomationPoint('point-1', 1, -3)]);
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 9);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
    expect(upgraded.getTracks()[0].getVolumeAutomation()).toHaveLength(1);
  });
});
