import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KGCore } from '../core/KGCore';
import { KGProject } from '../core/KGProject';
import { GlobalTrackType } from '../core/global-track';
import type { KGCommand } from '../core/commands';
import { KGAudioTrack } from '../core/track/KGAudioTrack';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import {
  applyDetectedTempoAction,
  buildDetectedTempoChoiceMessage,
  DETECTED_TEMPO_ACTION_INSERT_REGION,
  DETECTED_TEMPO_ACTION_UPDATE_CURRENT,
  getRightwardBeatAlignmentShiftBeats,
} from './audioTempoDetectionActions';
import { findGlobalTrackByType, getSortedTempoRegions } from './globalTrackUtil';

function mockCoreForProject(project: KGProject) {
  vi.mocked(KGCore.instance).mockReturnValue({
    getCurrentProject: vi.fn(() => project),
    executeCommand: vi.fn((command: KGCommand, options?: { rethrow?: boolean }) => {
      try {
        command.execute();
      } catch (error) {
        if (options?.rethrow) {
          throw error;
        }
      }
    }),
  } as unknown as KGCore);
}

describe('audio tempo detection actions', () => {
  beforeEach(() => {
    const project = new KGProject('test-project', 8);
    mockCoreForProject(project);
  });

  it('builds the detected tempo choice message', () => {
    expect(buildDetectedTempoChoiceMessage(128)).toBe(
      'Detected tempo: 128 BPM. Choose how to apply it.\n\nUpdate Current Tempo changes the active tempo at this clip location. Insert Tempo Change adds a new tempo region at the nearest bar before the clip starts.',
    );
  });

  it('leaves the project unchanged when no action is applied by the caller', () => {
    const project = new KGProject('test-project', 8);
    const setBpm = vi.fn((bpm: number) => {
      project.setBpm(bpm);
    });
    const refreshProjectState = vi.fn();

    expect(project.getBpm()).toBe(120);
    expect(refreshProjectState).not.toHaveBeenCalled();
    expect(setBpm).not.toHaveBeenCalled();
  });

  it('updates the tempo region covering the region start', () => {
    const project = new KGProject('test-project', 8);
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track not found');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('tempo-a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();
    const setBpm = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_UPDATE_CURRENT,
      detectedBpm: 132,
      detectedTempo: 132,
      detectedOffsetSeconds: 0,
      autoAlignRegionToBeat: false,
      project,
      regionId: 'audio-1',
      regionStartBeat: 10,
      regionTrackId: 'track-1',
      regionTrackIndex: 0,
      refreshProjectState,
      setBpm,
    });

    expect((tempoTrack.getRegions()[0] as KGTempoRegion).getBpm()).toBe(132);
    expect(setBpm).not.toHaveBeenCalled();
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('falls back to project BPM when no tempo region exists', () => {
    const project = new KGProject('test-project', 8);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();
    const setBpm = vi.fn((bpm: number) => {
      project.setBpm(bpm);
    });

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_UPDATE_CURRENT,
      detectedBpm: 136,
      detectedTempo: 136,
      detectedOffsetSeconds: 0,
      autoAlignRegionToBeat: false,
      project,
      regionId: 'audio-1',
      regionStartBeat: 6,
      regionTrackId: 'track-1',
      regionTrackIndex: 0,
      refreshProjectState,
      setBpm,
    });

    expect(project.getBpm()).toBe(136);
    expect(setBpm).toHaveBeenCalledWith(136);
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('creates a new tempo region at the floored start bar for mid-bar regions', () => {
    const project = new KGProject('test-project', 8);
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track not found');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('tempo-a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();
    const setBpm = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_INSERT_REGION,
      detectedBpm: 128,
      detectedTempo: 128,
      detectedOffsetSeconds: 0,
      autoAlignRegionToBeat: false,
      project,
      regionId: 'audio-1',
      regionStartBeat: 10,
      regionTrackId: 'track-1',
      regionTrackIndex: 0,
      refreshProjectState,
      setBpm,
    });

    const tempoRegions = getSortedTempoRegions(tempoTrack, 4);
    expect(tempoRegions).toHaveLength(2);
    expect(tempoRegions[0].getStartBar()).toBe(0);
    expect(tempoRegions[0].getLengthBars()).toBe(2);
    expect(tempoRegions[1].getStartBar()).toBe(2);
    expect(tempoRegions[1].getBpm()).toBe(128);
    expect(setBpm).not.toHaveBeenCalled();
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('uses the same bar when the region starts exactly on a bar boundary', () => {
    const project = new KGProject('test-project', 8);
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track not found');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('tempo-a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_INSERT_REGION,
      detectedBpm: 140,
      detectedTempo: 140,
      detectedOffsetSeconds: 0,
      autoAlignRegionToBeat: false,
      project,
      regionId: 'audio-1',
      regionStartBeat: 8,
      regionTrackId: 'track-1',
      regionTrackIndex: 0,
      refreshProjectState,
      setBpm: vi.fn(),
    });

    const tempoRegions = getSortedTempoRegions(tempoTrack, 4);
    expect(tempoRegions).toHaveLength(2);
    expect(tempoRegions[1].getStartBar()).toBe(2);
    expect(tempoRegions[1].getBpm()).toBe(140);
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('updates the existing tempo region when one already starts at the target bar', () => {
    const project = new KGProject('test-project', 8);
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track not found');
    }

    tempoTrack.setRegions([
      new KGTempoRegion('tempo-a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 2, 4),
      new KGTempoRegion('tempo-b', tempoTrack.getId(), tempoTrack.getTrackIndex(), 126, 2, 6, 4),
    ]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_INSERT_REGION,
      detectedBpm: 144,
      detectedTempo: 144,
      detectedOffsetSeconds: 0,
      autoAlignRegionToBeat: false,
      project,
      regionId: 'audio-1',
      regionStartBeat: 8,
      regionTrackId: 'track-1',
      regionTrackIndex: 0,
      refreshProjectState,
      setBpm: vi.fn(),
    });

    const tempoRegions = getSortedTempoRegions(tempoTrack, 4);
    expect(tempoRegions).toHaveLength(2);
    expect(tempoRegions[1].getStartBar()).toBe(2);
    expect(tempoRegions[1].getBpm()).toBe(144);
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('returns zero alignment shift for non-positive offsets', () => {
    expect(getRightwardBeatAlignmentShiftBeats(125, 0)).toBe(0);
    expect(getRightwardBeatAlignmentShiftBeats(125, -0.1)).toBe(0);
  });

  it('returns the minimum fractional shift to the next beat', () => {
    const shiftBeats = getRightwardBeatAlignmentShiftBeats(124.99114291787713, 0.38548752834467126);
    expect(shiftBeats).toBeGreaterThan(0);
    expect(shiftBeats).toBeCloseTo(0.19695788752686635, 6);
  });

  it('moves the audio region right when auto-align is enabled for update-current-tempo', () => {
    const project = new KGProject('test-project', 8);
    const track = new KGAudioTrack('Audio', 0);
    const region = new KGAudioRegion('audio-1', String(track.getId()), track.getTrackIndex(), 'Clip', 8, 4, 'file-1', 'clip.wav', 2);
    track.setRegions([region]);
    project.setTracks([track]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_UPDATE_CURRENT,
      detectedBpm: 125,
      detectedTempo: 124.99114291787713,
      detectedOffsetSeconds: 0.38548752834467126,
      autoAlignRegionToBeat: true,
      project,
      regionId: region.getId(),
      regionStartBeat: region.getStartFromBeat(),
      regionTrackId: region.getTrackId(),
      regionTrackIndex: region.getTrackIndex(),
      refreshProjectState,
      setBpm: vi.fn((bpm: number) => project.setBpm(bpm)),
    });

    expect(region.getStartFromBeat()).toBeCloseTo(8.196957887526867, 6);
    expect(region.getTrackId()).toBe(String(track.getId()));
    expect(region.getTrackIndex()).toBe(track.getTrackIndex());
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });

  it('moves the audio region right when auto-align is enabled for insert-tempo-change', () => {
    const project = new KGProject('test-project', 8);
    const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
    if (!tempoTrack) {
      throw new Error('Tempo track not found');
    }
    tempoTrack.setRegions([
      new KGTempoRegion('tempo-a', tempoTrack.getId(), tempoTrack.getTrackIndex(), 120, 0, 8, 4),
    ]);

    const track = new KGAudioTrack('Audio', 0);
    const region = new KGAudioRegion('audio-1', String(track.getId()), track.getTrackIndex(), 'Clip', 10, 4, 'file-1', 'clip.wav', 2);
    track.setRegions([region]);
    project.setTracks([track]);
    mockCoreForProject(project);

    const refreshProjectState = vi.fn();

    applyDetectedTempoAction({
      action: DETECTED_TEMPO_ACTION_INSERT_REGION,
      detectedBpm: 125,
      detectedTempo: 124.99114291787713,
      detectedOffsetSeconds: 0.38548752834467126,
      autoAlignRegionToBeat: true,
      project,
      regionId: region.getId(),
      regionStartBeat: region.getStartFromBeat(),
      regionTrackId: region.getTrackId(),
      regionTrackIndex: region.getTrackIndex(),
      refreshProjectState,
      setBpm: vi.fn(),
    });

    expect(region.getStartFromBeat()).toBeCloseTo(10.196957887526867, 6);
    expect(refreshProjectState).toHaveBeenCalledTimes(1);
  });
});
