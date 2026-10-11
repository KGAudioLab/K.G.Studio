import { instanceToPlain, plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGAudioTrack } from '../track/KGAudioTrack';
import { KGTrack } from '../track/KGTrack';
import { upgradeProjectToLatest } from '../project-upgrader/KGProjectUpgrader';
import { KGEQFX, KGReverbFX, KGCompressorFX, KGLimiterFX } from './index';

describe('track FX persistence', () => {
  it('round-trips ordered subclasses, duplicates, identity, and parameters on MIDI and audio tracks', () => {
    const project = new KGProject('FX');
    const tracks = [new KGMidiTrack('MIDI', 1), new KGAudioTrack('Audio', 2)];
    for (const track of tracks) {
      const first = new KGEQFX([{ frequencyHz: 300, q: 2, gainDb: -6 }]);
      first.setEnabled(false);
      track.setFX([first, new KGReverbFX('spring', 0.35), new KGEQFX(),
        new KGCompressorFX({ ratio: 7, attackMs: 30, releaseMs: 150, gainDb: 3 }),
        new KGLimiterFX({ inputGainDb: 4, thresholdDb: -8 })]);
    }
    project.setTracks(tracks);
    const saved = instanceToPlain(project);
    const restored = plainToInstance(KGProject, JSON.parse(JSON.stringify(saved)) as Record<string, unknown>);
    expect(instanceToPlain(restored)).toEqual(saved);
    for (const track of restored.getTracks()) {
      expect(track.getFX().map(effect => effect.constructor)).toEqual([KGEQFX, KGReverbFX, KGEQFX, KGCompressorFX, KGLimiterFX]);
      expect(track.getFX()[0].getEnabled()).toBe(false);
      expect(new Set(track.getFX().map(effect => effect.getId())).size).toBe(5);
      expect(saved.tracks[0].fx[0]).not.toHaveProperty('expanded');
      expect(saved.tracks[0].fx[0]).not.toHaveProperty('selectedBand');
    }
  });

  it.each([undefined, null])('loads missing/null FX as independent empty lists and upgrades v21', fx => {
    const data = { ...instanceToPlain(new KGProject('Legacy')), projectStructureVersion: 21, tracks: [
      { __type: 'KGMidiTrack', id: 1, fx }, { __type: 'KGAudioTrack', id: 2, fx },
    ] };
    const project = upgradeProjectToLatest(plainToInstance(KGProject, data));
    const [first, second] = project.getTracks();
    expect(first.getFX()).toEqual([]); expect(second.getFX()).toEqual([]);
    first.addFX(new KGEQFX());
    expect(second.getFX()).toEqual([]);
    expect(project.getProjectStructureVersion()).toBe(22);
    const snapshot = instanceToPlain(project);
    upgradeProjectToLatest(project);
    expect(instanceToPlain(project)).toEqual(snapshot);
  });

  it('normalizes malformed saved parameters without relying on setters', () => {
    const track = plainToInstance(KGTrack, { fx: [
      { __type: 'KGEQFX', bands: [{ frequencyHz: 90000, q: 0, gainDb: NaN }], enabled: 'false' },
      { __type: 'KGReverbFX', reverbType: 'invalid', wet: 4 },
      { __type: 'KGCompressorFX', ratio: 100, attackMs: -1, releaseMs: Infinity, thresholdDb: -300 },
      { __type: 'KGLimiterFX', inputGainDb: 100, thresholdDb: 10 },
    ] });
    expect((track.getFX()[0] as KGEQFX).getBands()).toEqual([
      { frequencyHz: 1349, q: 0.1, gainDb: 0 }, { frequencyHz: 1350, q: 0.5, gainDb: 0 }, { frequencyHz: 6500, q: 0.5, gainDb: 0 },
    ]);
    expect(track.getFX()[0].getEnabled()).toBe(true);
    expect((track.getFX()[1] as KGReverbFX).getReverbType()).toBe('hall');
    expect((track.getFX()[1] as KGReverbFX).getWet()).toBe(1);
    expect((track.getFX()[2] as KGCompressorFX).getParameters()).toEqual({ ratio: 20, attackMs: 0, releaseMs: 228, thresholdDb: -100, gainDb: 0 });
    expect((track.getFX()[3] as KGLimiterFX).getParameters()).toEqual({ inputGainDb: 24, thresholdDb: 0 });
  });

  it('rejects unknown saved types and malformed lists instead of dropping data', () => {
    expect(() => plainToInstance(KGTrack, { fx: [{ __type: 'FutureFX' }] })).toThrow('Unsupported FX type');
    expect(() => plainToInstance(KGTrack, { fx: {} })).toThrow('Invalid track FX list');
  });

  it('moves/removes by ID and copies settings without shared bands', () => {
    const track = new KGTrack(); const first = new KGEQFX(); const second = new KGEQFX();
    track.addFX(first); track.addFX(second);
    track.moveFX(first.getId(), 1);
    expect(track.getFX().map(effect => effect.getId())).toEqual([second.getId(), first.getId()]);
    track.removeFX(second.getId());
    expect(track.getFX()).toHaveLength(1);
    const original = track.getFX()[0] as KGEQFX;
    const copy = original.clone(true);
    const bands = copy.getBands(); bands[0].gainDb = 12; copy.setBands(bands);
    expect(copy.getId()).not.toBe(original.getId());
    expect(original.getBands()[0].gainDb).toBe(0);
    expect(first.getBands()[0].gainDb).toBe(0);
  });
});
