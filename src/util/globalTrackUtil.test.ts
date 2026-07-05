import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { GlobalTrackType } from '../core/global-track';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { beatRangeToSeconds, beatToSeconds, getAudioRegionDisplayLengthBeats, getEffectiveBpmAtBeat, getRequiredMaxBarsForAudioRegions, normalizeTempoRegionsForProject, secondsToBeat, syncAudioRegionLengthsToPlaybackDuration } from './globalTrackUtil';

describe('globalTrackUtil tempo helpers', () => {
  it('falls back to project bpm when no tempo regions exist', () => {
    const project = new KGProject('Tempo', 8, 0, 120);
    expect(getEffectiveBpmAtBeat(project, 6)).toBe(120);
    expect(beatToSeconds(project, 4)).toBeCloseTo(2);
  });

  it('resolves effective bpm and time across tempo regions', () => {
    const project = new KGProject('Tempo', 8, 0, 120);
    const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track missing');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('b', tempoTrack.getId(), tempoTrack.getTrackIndex(), 60, 2, 6, 4),
    ]);

    expect(getEffectiveBpmAtBeat(project, 2)).toBe(120);
    expect(getEffectiveBpmAtBeat(project, 10)).toBe(60);
    expect(beatToSeconds(project, 8)).toBeCloseTo(4);
    expect(beatToSeconds(project, 12)).toBeCloseTo(8);
    expect(beatRangeToSeconds(project, 8, 12)).toBeCloseTo(4);
    expect(secondsToBeat(project, 8)).toBeCloseTo(12);
  });

  it('normalizes trailing tempo coverage when song length grows and shrinks', () => {
    const project = new KGProject('Tempo', 8, 0, 120);
    const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track missing');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 4, 4),
      new KGTempoRegion('b', tempoTrack.getId(), tempoTrack.getTrackIndex(), 140, 4, 4, 4),
    ]);

    project.setMaxBars(10);
    normalizeTempoRegionsForProject(project);
    let regions = tempoTrack.getRegions() as KGTempoRegion[];
    expect(regions[1].getEndBar()).toBe(10);

    project.setMaxBars(6);
    normalizeTempoRegionsForProject(project);
    regions = tempoTrack.getRegions() as KGTempoRegion[];
    expect(regions).toHaveLength(2);
    expect(regions[1].getStartBar()).toBe(4);
    expect(regions[1].getEndBar()).toBe(6);
  });

  it('projects audio duration through the tempo map for display length', () => {
    const project = new KGProject('Tempo', 16, 0, 120);
    const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track missing');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 4, 4),
      new KGTempoRegion('b', tempoTrack.getId(), tempoTrack.getTrackIndex(), 60, 4, 12, 4),
    ]);

    const region = new KGAudioRegion('audio', 'track-1', 0, 'Audio', 0, 48, 'file', 'file.wav', 24, 0);
    expect(getAudioRegionDisplayLengthBeats(project, region)).toBeCloseTo(32);
  });

  it('computes required bars for a slower project BPM change', () => {
    const project = new KGProject('Tempo', 8, 0, 60);
    const track = new KGAudioTrack('Audio', 1);
    track.setRegions([
      new KGAudioRegion('audio', '1', 0, 'Audio', 28, 4, 'file', 'file.wav', 8, 0),
    ]);
    project.setTracks([track]);

    expect(getRequiredMaxBarsForAudioRegions(project)).toBe(9);
  });

  it('computes required bars from playable audio after clip offset', () => {
    const project = new KGProject('Tempo', 8, 0, 60);
    const track = new KGAudioTrack('Audio', 1);
    track.setRegions([
      new KGAudioRegion('audio', '1', 0, 'Audio', 28, 4, 'file', 'file.wav', 10, 6),
    ]);
    project.setTracks([track]);

    expect(getRequiredMaxBarsForAudioRegions(project)).toBe(8);
  });

  it('uses the farthest audio region end when multiple regions are present', () => {
    const project = new KGProject('Tempo', 8, 0, 60);
    const track = new KGAudioTrack('Audio', 1);
    track.setRegions([
      new KGAudioRegion('audio-a', '1', 0, 'Audio A', 24, 4, 'file-a', 'a.wav', 4, 0),
      new KGAudioRegion('audio-b', '1', 0, 'Audio B', 28, 4, 'file-b', 'b.wav', 12, 0),
    ]);
    project.setTracks([track]);

    expect(getRequiredMaxBarsForAudioRegions(project)).toBe(10);
  });

  it('extends beyond the current song end using the trailing tempo region BPM', () => {
    const project = new KGProject('Tempo', 8, 0, 120);
    const tempoTrack = project.getGlobalTracks().find(track => track.getType() === GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track missing');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 4, 4),
      new KGTempoRegion('b', tempoTrack.getId(), tempoTrack.getTrackIndex(), 60, 4, 4, 4),
    ]);

    const track = new KGAudioTrack('Audio', 1);
    track.setRegions([
      new KGAudioRegion('audio', '1', 0, 'Audio', 28, 4, 'file', 'file.wav', 8, 0),
    ]);
    project.setTracks([track]);

    expect(getRequiredMaxBarsForAudioRegions(project)).toBe(9);
  });

  it('syncs stored audio region length to the tempo-aware playback duration', () => {
    const project = new KGProject('Tempo', 16, 0, 120);
    const track = new KGAudioTrack('Audio', 1);
    const region = new KGAudioRegion('audio', '1', 0, 'Audio', 0, 24, 'file', 'file.wav', 12, 0);
    track.setRegions([region]);
    project.setTracks([track]);

    project.setBpm(240);
    syncAudioRegionLengthsToPlaybackDuration(project);

    expect(region.getLength()).toBeCloseTo(48);
    expect(getAudioRegionDisplayLengthBeats(project, region)).toBeCloseTo(48);
  });
});
