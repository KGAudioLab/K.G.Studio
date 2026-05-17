import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGTrack } from '../track/KGTrack';
import { upgradeProjectToLatest } from './KGProjectUpgrader';
import { upgradeToV11 } from './upgradeToV11';

describe('upgradeToV11', () => {
  it('initializes missing mute and solo flags on legacy tracks', () => {
    const track = new KGTrack('Legacy Track', 1);
    delete (track as unknown as { muted?: unknown }).muted;
    delete (track as unknown as { solo?: unknown }).solo;
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 10);

    upgradeToV11(project);

    expect(track.getMuted()).toBe(false);
    expect(track.getSolo()).toBe(false);
    expect(project.getProjectStructureVersion()).toBe(11);
  });

  it('preserves existing mute and solo flags', () => {
    const track = new KGTrack('Legacy Track', 1);
    track.setMuted(true);
    track.setSolo(true);
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 10);

    upgradeToV11(project);

    expect(track.getMuted()).toBe(true);
    expect(track.getSolo()).toBe(true);
  });

  it('upgrades legacy projects through the main upgrader path', () => {
    const track = new KGTrack('Legacy Track', 1);
    delete (track as unknown as { muted?: unknown }).muted;
    delete (track as unknown as { solo?: unknown }).solo;
    const project = new KGProject('Test', 32, 0, 125, undefined, undefined, undefined, undefined, undefined, 1, [track], 10);

    const upgraded = upgradeProjectToLatest(project);

    expect(upgraded.getProjectStructureVersion()).toBe(11);
    expect(upgraded.getTracks()[0].getMuted()).toBe(false);
    expect(upgraded.getTracks()[0].getSolo()).toBe(false);
  });
});
