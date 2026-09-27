import { KGProject } from '../core/KGProject';
import type { KeySignature } from '../core/KGProject';
import {
  GlobalTrackType,
  KGGlobalTrack,
  createDefaultGlobalTracks,
} from '../core/global-track';
import { KGGlobalRegion } from '../core/region/KGGlobalRegion';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import {
  quarterNotesToTicks,
  secondsToTick as timelineSecondsToTick,
  tickToSeconds as timelineTickToSeconds,
  ticksPerBar as getTicksPerBar,
  type TimelineTempoEvent,
} from '../core/timing';

export const DEFAULT_MARKER_REGION_NAME = 'Marker';

export interface AudioRegionLengthSnapshot {
  region: KGAudioRegion;
  length: number;
}

export function ensureDefaultGlobalTracks(project: KGProject): KGGlobalTrack[] {
  const existingTracks = project.getGlobalTracks?.() ?? [];
  const nextTracks = createDefaultGlobalTracks();

  for (const existingTrack of existingTracks) {
    const matchedTrack = nextTracks.find(track => track.getType() === existingTrack.getType());
    if (matchedTrack) {
      matchedTrack.setRegions(existingTrack.getRegions());
    }
  }

  nextTracks.forEach((track, index) => {
    track.setTrackIndex(index);
  });

  project.setGlobalTracks(nextTracks);
  return nextTracks;
}

export function getSongEndTick(project: KGProject): number {
  return project.getMaxBars() * getTicksPerBar(project.getTimeSignature());
}

export function findGlobalTrackByType(project: KGProject, type: GlobalTrackType): KGGlobalTrack | null {
  return (project.getGlobalTracks?.() ?? []).find(track => track.getType() === type) ?? null;
}

export function findGlobalTrackContainingRegion(
  project: KGProject,
  regionId: string
): { track: KGGlobalTrack; region: KGGlobalRegion; regionIndex: number } | null {
  for (const track of project.getGlobalTracks()) {
    const regionIndex = track.getRegions().findIndex(region => region.getId() === regionId);
    if (regionIndex !== -1) {
      const region = track.getRegions()[regionIndex];
      return { track, region, regionIndex };
    }
  }

  return null;
}

export function findMarkerNeighborBounds(
  project: KGProject,
  regionId: string | null,
  proposedStartTick: number
): { minStartTick: number; maxEndTick: number; nextStartTick: number | null } {
  return findNonOverlappingNeighborBounds(project, GlobalTrackType.Marker, regionId, proposedStartTick);
}

export function findNonOverlappingNeighborBounds(
  project: KGProject,
  trackType: GlobalTrackType.Marker | GlobalTrackType.Chord,
  regionId: string | null,
  proposedStartTick: number
): { minStartTick: number; maxEndTick: number; nextStartTick: number | null } {
  const track = findGlobalTrackByType(project, trackType);
  const songEndTick = getSongEndTick(project);

  if (!track) {
    return { minStartTick: 0, maxEndTick: songEndTick, nextStartTick: null };
  }

  const otherRegions = track.getRegions()
    .filter(region => region.getId() !== regionId)
    .sort((left, right) => left.getStartTick() - right.getStartTick());

  let minStartTick = 0;
  let maxEndTick = songEndTick;
  let nextStartTick: number | null = null;

  for (const region of otherRegions) {
    if (region.getStartTick() < proposedStartTick) {
      minStartTick = Math.max(minStartTick, region.getStartTick() + region.getLengthTicks());
      continue;
    }

    maxEndTick = Math.min(maxEndTick, region.getStartTick());
    nextStartTick = region.getStartTick();
    break;
  }

  return { minStartTick, maxEndTick, nextStartTick };
}

export function findChordRegionAtTick(project: KGProject, tick: number): KGChordRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Chord);
  if (!track) {
    return null;
  }

  return track.getRegions()
    .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
    .find(region => tick >= region.getStartTick() && tick < region.getStartTick() + region.getLengthTicks()) ?? null;
}

export function getSongEndBar(project: KGProject): number {
  return project.getMaxBars();
}

export function getSortedTempoRegions(track: KGGlobalTrack, ticksPerBar: number): KGTempoRegion[] {
  return track.getRegions()
    .filter((region): region is KGTempoRegion => region instanceof KGTempoRegion)
    .map((region) => {
      region.syncBarsFromTicks(ticksPerBar);
      return region;
    })
    .sort((left, right) => left.getStartTick() - right.getStartTick());
}

export function cloneTempoRegions(regions: KGTempoRegion[], ticksPerBar: number): KGTempoRegion[] {
  return regions.map(region => {
    const clone = new KGTempoRegion(
      region.getId(),
      region.getTrackId(),
      region.getTrackIndex(),
      region.getBpm(),
      0,
      1,
      ticksPerBar,
    );
    clone.setStartTick(region.getStartTick());
    clone.setLengthTicks(region.getLengthTicks());
    clone.syncBarsFromTicks(ticksPerBar);
    return clone;
  });
}

export function getSortedKeySignatureRegions(track: KGGlobalTrack, ticksPerBar: number): KGKeySignatureRegion[] {
  return track.getRegions()
    .filter((region): region is KGKeySignatureRegion => region instanceof KGKeySignatureRegion)
    .map((region) => {
      region.syncBarsFromTicks(ticksPerBar);
      return region;
    })
    .sort((left, right) => left.getStartTick() - right.getStartTick());
}

export function cloneKeySignatureRegions(regions: KGKeySignatureRegion[], ticksPerBar: number): KGKeySignatureRegion[] {
  return regions.map(region => new KGKeySignatureRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getKeySignature(),
    region.getStartBar(),
    region.getLengthBars(),
    ticksPerBar
  ));
}

export function findKeySignatureRegionAtBar(project: KGProject, bar: number): KGKeySignatureRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
  if (!track) {
    return null;
  }

  const barTicks = getTicksPerBar(project.getTimeSignature());
  const tick = bar * barTicks;
  return getSortedKeySignatureRegions(track, barTicks)
    .find(region => tick >= region.getStartTick() && tick < region.getStartTick() + region.getLengthTicks()) ?? null;
}

export function findKeySignatureRegionAtTick(project: KGProject, tick: number): KGKeySignatureRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
  if (!track) return null;
  return getSortedKeySignatureRegions(track, getTicksPerBar(project.getTimeSignature()))
    .find(region => tick >= region.getStartTick() && tick < region.getStartTick() + region.getLengthTicks()) ?? null;
}

export function findTempoRegionAtBar(project: KGProject, bar: number): KGTempoRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!track) {
    return null;
  }

  const barTicks = getTicksPerBar(project.getTimeSignature());
  const tick = bar * barTicks;
  return getSortedTempoRegions(track, barTicks)
    .find(region => tick >= region.getStartTick() && tick < region.getStartTick() + region.getLengthTicks()) ?? null;
}

export function findTempoRegionAtTick(project: KGProject, tick: number): KGTempoRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!track) return null;
  return getSortedTempoRegions(track, getTicksPerBar(project.getTimeSignature()))
    .find(region => tick >= region.getStartTick() && tick < region.getStartTick() + region.getLengthTicks()) ?? null;
}

export function getEffectiveKeySignatureAtTick(project: KGProject, tick: number): KeySignature {
  return findKeySignatureRegionAtTick(project, tick)?.getKeySignature() ?? project.getKeySignature();
}

export function getEffectiveBpmAtBar(project: KGProject, bar: number): number {
  return findTempoRegionAtBar(project, bar)?.getBpm() ?? project.getBpm();
}

export function getEffectiveBpmAtTick(project: KGProject, tick: number): number {
  return findTempoRegionAtTick(project, tick)?.getBpm() ?? project.getBpm();
}

export function getClampedKeySignatureRegionEndBar(region: KGKeySignatureRegion, maxBars: number): number {
  return Math.max(region.getStartBar(), Math.min(region.getEndBar(), maxBars));
}

export function getClampedTempoRegionEndBar(region: KGTempoRegion, maxBars: number): number {
  return Math.max(region.getStartBar(), Math.min(region.getEndBar(), maxBars));
}

export function normalizeTempoRegionsForProject(project: KGProject): void {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!track) {
    return;
  }

  const ticksPerBar = getTicksPerBar(project.getTimeSignature());
  const songEndTick = getSongEndTick(project);
  const regions = getSortedTempoRegions(track, ticksPerBar)
    .filter((region, index, sorted) => (
      region.getStartTick() < songEndTick
      && (index === sorted.length - 1 || region.getStartTick() !== sorted[index + 1].getStartTick())
    ));
  if (regions.length === 0) {
    return;
  }

  regions[0].setStartTick(0);
  regions.forEach((region, index) => {
    const endTick = regions[index + 1]?.getStartTick() ?? songEndTick;
    region.setLengthTicks(Math.max(1, endTick - region.getStartTick()));
    region.syncBarsFromTicks(ticksPerBar);
  });
  track.setRegions(regions);
}

function getProjectTempoEvents(project: KGProject): TimelineTempoEvent[] {
  const ticksPerBar = getTicksPerBar(project.getTimeSignature());
  const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!tempoTrack) return [];
  return getSortedTempoRegions(tempoTrack, ticksPerBar).map(region => ({
    tick: region.getStartTick(),
    bpm: region.getBpm(),
  }));
}

export function tickToSeconds(project: KGProject, tick: number): number {
  return timelineTickToSeconds(tick, getProjectTempoEvents(project), project.getBpm());
}

export function tickRangeToSeconds(project: KGProject, startTick: number, endTick: number): number {
  if (endTick <= startTick) {
    return 0;
  }

  return tickToSeconds(project, endTick) - tickToSeconds(project, startTick);
}

export function secondsToTick(project: KGProject, seconds: number): number {
  return timelineSecondsToTick(seconds, getProjectTempoEvents(project), project.getBpm());
}

export function getAudioRegionDisplayLengthTicks(project: KGProject, region: KGAudioRegion): number {
  if (!project.getTimeSignature?.() || !project.getBpm?.()) {
    return region.getLengthTicks();
  }

  const startTick = region.getStartTick();
  const availableAudioSeconds = Math.max(0, region.getAudioDurationSeconds() - region.getClipStartOffsetSeconds());
  const endTick = getAudioRegionPlaybackEndTick(project, region);
  return Math.max(0, endTick - startTick);
}

export function getAudioRegionPlaybackEndTick(project: KGProject, region: KGAudioRegion): number {
  const startTick = region.getStartTick();
  const availableAudioSeconds = Math.max(0, region.getAudioDurationSeconds() - region.getClipStartOffsetSeconds());
  if (availableAudioSeconds <= 0) {
    return startTick;
  }

  const targetSeconds = tickToSeconds(project, startTick) + availableAudioSeconds;
  const songEndTick = getSongEndTick(project);
  const songEndSeconds = tickToSeconds(project, songEndTick);

  if (targetSeconds <= songEndSeconds) {
    return secondsToTick(project, targetSeconds);
  }

  const tailBpm = getEffectiveBpmAtTick(project, Math.max(0, songEndTick - 1));
  return songEndTick + quarterNotesToTicks((targetSeconds - songEndSeconds) / (60 / tailBpm));
}

export function getRequiredMaxBarsForAudioRegions(project: KGProject): number {
  const ticksPerBar = getTicksPerBar(project.getTimeSignature());
  let requiredBars = project.getMaxBars();

  for (const track of project.getTracks()) {
    for (const region of track.getRegions()) {
      if (!(region instanceof KGAudioRegion)) {
        continue;
      }

      const regionEndTick = getAudioRegionPlaybackEndTick(project, region);
      const regionRequiredBars = Math.ceil(regionEndTick / ticksPerBar);
      requiredBars = Math.max(requiredBars, regionRequiredBars);
    }
  }

  return requiredBars;
}

export function syncAudioRegionLengthsToPlaybackDuration(project: KGProject): AudioRegionLengthSnapshot[] {
  const changedRegions: AudioRegionLengthSnapshot[] = [];

  for (const track of project.getTracks()) {
    for (const region of track.getRegions()) {
      if (!(region instanceof KGAudioRegion)) {
        continue;
      }

      const nextLength = Math.max(0, getAudioRegionPlaybackEndTick(project, region) - region.getStartTick());
      if (region.getLengthTicks() === nextLength) {
        continue;
      }

      changedRegions.push({
        region,
        length: region.getLengthTicks(),
      });
      region.setLengthTicks(nextLength);
    }
  }

  return changedRegions;
}

export function restoreAudioRegionLengths(snapshots: AudioRegionLengthSnapshot[]): void {
  snapshots.forEach(({ region, length }) => {
    region.setLengthTicks(length);
  });
}
