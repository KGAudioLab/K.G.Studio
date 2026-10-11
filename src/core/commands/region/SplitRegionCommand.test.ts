import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { KGCore } from '../../KGCore';
import { KGProject } from '../../KGProject';
import { KGAudioRegion } from '../../region/KGAudioRegion';
import { GlobalTrackType } from '../../global-track';
import { KGTempoRegion } from '../../region/KGTempoRegion';
import { KGAudioTrack } from '../../track/KGAudioTrack';
import { quarterNotesToTicks } from '../../timing';
import { SplitRegionCommand } from './SplitRegionCommand';
import { ResizeRegionCommand } from './ResizeRegionCommand';
import { ResizeMultipleRegionsCommand } from './TransformRegionsCommand';
import { getAudioRegionDisplayLengthTicks, syncAudioRegionLengthsToPlaybackDuration } from '../../../util/globalTrackUtil';

vi.mock('../../KGCore', () => ({ KGCore: { instance: vi.fn() } }));
vi.mock('../../../stores/projectStore', () => ({
  useProjectStore: { getState: () => ({ showPianoRoll: false, activeRegionId: null }) },
}));

const q = quarterNotesToTicks;

describe('SplitRegionCommand audio clips', () => {
  let project: KGProject;
  let track: KGAudioTrack;
  let original: KGAudioRegion;

  beforeEach(() => {
    project = new KGProject('Split audio', 16, 0, 120);
    track = new KGAudioTrack('Audio', 1);
    original = new KGAudioRegion('audio', '1', 0, 'Audio', q(4), q(16), 'file', 'audio.wav', 10, 2);
    track.setRegions([original]);
    project.setTracks([track]);
    vi.mocked(KGCore.instance).mockReturnValue({ getCurrentProject: () => project } as KGCore);
  });

  it('keeps both displayed halves and playable source ranges aligned with the split', () => {
    const command = new SplitRegionCommand(original.getId(), q(12));
    command.execute();
    const [left, right] = track.getRegions() as KGAudioRegion[];

    expect(left.getStartTick()).toBe(q(4));
    expect(right.getStartTick()).toBe(q(12));
    for (const region of [left, right]) {
      expect(region.getLengthTicks()).toBe(q(8));
      expect(getAudioRegionDisplayLengthTicks(project, region)).toBeCloseTo(q(8));
      expect(region.getPlayableDurationSeconds()).toBe(4);
      expect(region.getAudioDurationSeconds()).toBe(10);
      expect(region.getAudioFileId()).toBe('file');
    }
    expect(left.getClipStartOffsetSeconds()).toBe(2);
    expect(left.getClipEndOffsetSeconds()).toBe(6);
    expect(right.getClipStartOffsetSeconds()).toBe(6);
    expect(right.getClipEndOffsetSeconds()).toBe(10);

    command.undo();
    expect(track.getRegions()).toEqual([original]);
    command.execute();
    expect(getAudioRegionDisplayLengthTicks(project, track.getRegions()[0] as KGAudioRegion)).toBe(q(8));
  });

  it('preserves split boundaries when tempo changes and lengths are resynced', () => {
    new SplitRegionCommand(original.getId(), q(12)).execute();
    project.setBpm(240);
    syncAudioRegionLengthsToPlaybackDuration(project);
    for (const region of track.getRegions() as KGAudioRegion[]) {
      expect(region.getLengthTicks()).toBe(q(16));
      expect(region.getPlayableDurationSeconds()).toBe(4);
    }
  });

  it('splits a previously split left half without restoring its discarded tail', () => {
    new SplitRegionCommand(original.getId(), q(12)).execute();
    const left = track.getRegions()[0];
    new SplitRegionCommand(left.getId(), q(8)).execute();
    const [first, second] = track.getRegions() as KGAudioRegion[];
    expect(first.getPlayableDurationSeconds()).toBe(2);
    expect(second.getPlayableDurationSeconds()).toBe(2);
    expect(second.getClipEndOffsetSeconds()).toBe(6);
    expect(getAudioRegionDisplayLengthTicks(project, second)).toBe(q(4));
  });

  it('uses elapsed seconds across a tempo change when splitting', () => {
    const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo)!;
    tempoTrack.setRegions([
      new KGTempoRegion('fast', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, q(4)),
      new KGTempoRegion('slow', tempoTrack.getId(), tempoTrack.getTrackIndex(), 60, 2, 14, q(4)),
    ]);
    original.setLengthTicks(q(10)); // 2 seconds before bar 3 + 6 seconds after it.
    new SplitRegionCommand(original.getId(), q(10)).execute();
    const [left, right] = track.getRegions() as KGAudioRegion[];
    expect(left.getPlayableDurationSeconds()).toBe(4);
    expect(right.getPlayableDurationSeconds()).toBe(4);
    expect(right.getClipStartOffsetSeconds()).toBe(6);
    expect(getAudioRegionDisplayLengthTicks(project, left)).toBe(q(6));
    expect(getAudioRegionDisplayLengthTicks(project, right)).toBe(q(4));
  });

  it('retains the source boundary on serialization and supports older regions', () => {
    new SplitRegionCommand(original.getId(), q(12)).execute();
    const left = track.getRegions()[0] as KGAudioRegion;
    const restored = plainToInstance(KGAudioRegion, instanceToPlain(left));
    expect(restored.getPlayableDurationSeconds()).toBe(4);
    expect(getAudioRegionDisplayLengthTicks(project, restored)).toBe(q(8));
    expect(original.getClipEndOffsetSeconds()).toBeUndefined();
    expect(original.getPlayableDurationSeconds()).toBe(8);
  });

  it.each(['single', 'multiple'])('allows extending the split edge and undoing a %s resize', mode => {
    new SplitRegionCommand(original.getId(), q(12)).execute();
    const left = track.getRegions()[0] as KGAudioRegion;
    // Move the other half away to allow extending the first half.
    track.getRegions()[1].setStartTick(q(24));
    const command = mode === 'single'
      ? new ResizeRegionCommand(left.getId(), q(4), q(12))
      : new ResizeMultipleRegionsCommand(left.getId(), 'end', 0, q(4), [left.getId()]);
    command.execute();
    expect(left.getPlayableDurationSeconds()).toBe(6);
    expect(getAudioRegionDisplayLengthTicks(project, left)).toBe(q(12));
    command.undo();
    expect(left.getPlayableDurationSeconds()).toBe(4);
    expect(getAudioRegionDisplayLengthTicks(project, left)).toBe(q(8));
  });
});
