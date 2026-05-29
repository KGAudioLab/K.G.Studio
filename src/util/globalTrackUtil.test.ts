import { describe, expect, it } from 'vitest';
import { KGProject } from '../core/KGProject';
import { GlobalTrackType } from '../core/global-track';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { beatRangeToSeconds, beatToSeconds, getAudioRegionDisplayLengthBeats, getEffectiveBpmAtBeat, normalizeTempoRegionsForProject, secondsToBeat } from './globalTrackUtil';

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
});
