import { describe, expect, it } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGTrackAutomationPoint } from '../track/KGTrackAutomationPoint';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('base track pan persistence and v21 migration', () => {
  it.each([undefined, null, 'left', NaN, Infinity, -2, 2, -0.75, 1])('upgrades legacy pan %s without touching automation', pan => {
    const project = new KGProject('Legacy');
    const track = new KGMidiTrack('Lead', 1);
    track.setPanAutomation([new KGTrackAutomationPoint('pan', 0, 0.5)]);
    project.setTracks([track]);
    const data = instanceToPlain(project);
    data.projectStructureVersion = 20;
    data.tracks[0].pan = pan;
    const restored = plainToInstance(KGProject, data);
    upgradeProjectToLatest(restored);
    const expected = typeof pan === 'number' && Number.isFinite(pan) && pan >= -1 && pan <= 1 ? pan : 0;
    expect(restored.getTracks()[0].getPan()).toBe(expected);
    expect(restored.getTracks()[0].getPanAutomation()[0].getValue()).toBe(0.5);
    expect(restored.getProjectStructureVersion()).toBe(21);
    upgradeProjectToLatest(restored);
    expect(restored.getTracks()[0].getPan()).toBe(expected);
  });

  it('defaults missing pan to center and round-trips a saved base pan', () => {
    const project = new KGProject('Saved');
    const track = new KGMidiTrack('Lead', 1);
    expect(track.getPan()).toBe(0);
    track.setPan(-0.35);
    project.setTracks([track]);
    const data = instanceToPlain(project);
    expect(data.tracks[0].pan).toBe(-0.35);
    const restored = plainToInstance(KGProject, JSON.parse(JSON.stringify(data)) as Record<string, unknown>);
    expect(restored.getTracks()[0].getPan()).toBe(-0.35);
    delete data.tracks[0].pan;
    expect(plainToInstance(KGProject, data).getTracks()[0].getPan()).toBe(0);
  });

  it('clamps pan at the model setter', () => {
    const track = new KGMidiTrack();
    track.setPan(-2);
    expect(track.getPan()).toBe(-1);
    track.setPan(2);
    expect(track.getPan()).toBe(1);
  });
});
