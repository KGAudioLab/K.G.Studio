import { KGAudioInterface } from '../../audio-interface/KGAudioInterface';
import { describe, expect, it, vi } from 'vitest';
import { KGTrack } from '../../track/KGTrack';
import { KGEQFX, KGLimiterFX } from '../../fx';
import { SetTrackFXCommand } from './SetTrackFXCommand';

describe('FX command snapshots', () => {
  it('synchronizes audio after edits, undo, and redo', () => {
    const sync = vi.spyOn(KGAudioInterface.instance(), 'setTrackFX');
    try {
      const track = new KGTrack('Audio', 123); const eq = new KGEQFX();
      const command = new SetTrackFXCommand(track, [eq]);
      command.execute();
      expect(sync).toHaveBeenLastCalledWith('123', track.getFX());
      command.undo();
      expect(sync).toHaveBeenLastCalledWith('123', []);
      command.execute();
      expect(sync).toHaveBeenCalledTimes(3);
      expect(sync.mock.calls[2][1][0].getId()).toBe(eq.getId());
    } finally { sync.mockRestore(); }
  });
  it('undoes and redoes edits with stable identity and independent snapshots', () => {
    const track = new KGTrack(); const eq = new KGEQFX(); track.addFX(eq);
    const limiter = new KGLimiterFX({ inputGainDb: 8 });
    const add = new SetTrackFXCommand(track, [...track.getFX(), limiter]); add.execute();
    limiter.setParameters({ inputGainDb: 20 });
    add.undo(); expect(track.getFX().map(effect => effect.getId())).toEqual([eq.getId()]);
    add.execute(); expect((track.getFX()[1] as KGLimiterFX).getParameters().inputGainDb).toBe(8);
    const remove = new SetTrackFXCommand(track, [track.getFX()[1]]); remove.execute();
    remove.undo(); expect(track.getFX().map(effect => effect.getId())).toEqual([eq.getId(), limiter.getId()]);
  });
  it('merges continuous edits but retains the original undo state', () => {
    const track = new KGTrack(); const limiter = new KGLimiterFX(); track.addFX(limiter);
    const first = new SetTrackFXCommand(track, [new KGLimiterFX({ inputGainDb: 2 }, limiter.getId())], 'gain'); first.execute();
    const second = new SetTrackFXCommand(track, [new KGLimiterFX({ inputGainDb: 4 }, limiter.getId())], 'gain'); second.execute();
    const merged = first.mergeWith(second)!;
    merged.undo(); expect((track.getFX()[0] as KGLimiterFX).getParameters().inputGainDb).toBe(0);
    merged.execute(); expect((track.getFX()[0] as KGLimiterFX).getParameters().inputGainDb).toBe(4);
    expect(first.canMergeWith(new SetTrackFXCommand(track, [], 'threshold'))).toBe(false);
  });
});
