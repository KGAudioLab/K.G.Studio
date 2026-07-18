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

export function getSongEndBeat(project: KGProject): number {
  return project.getMaxBars() * project.getTimeSignature().numerator;
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
  proposedStartBeat: number
): { minStartBeat: number; maxEndBeat: number; nextStartBeat: number | null } {
  return findNonOverlappingNeighborBounds(project, GlobalTrackType.Marker, regionId, proposedStartBeat);
}

export function findNonOverlappingNeighborBounds(
  project: KGProject,
  trackType: GlobalTrackType.Marker | GlobalTrackType.Chord,
  regionId: string | null,
  proposedStartBeat: number
): { minStartBeat: number; maxEndBeat: number; nextStartBeat: number | null } {
  const track = findGlobalTrackByType(project, trackType);
  const songEndBeat = getSongEndBeat(project);

  if (!track) {
    return { minStartBeat: 0, maxEndBeat: songEndBeat, nextStartBeat: null };
  }

  const otherRegions = track.getRegions()
    .filter(region => region.getId() !== regionId)
    .sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());

  let minStartBeat = 0;
  let maxEndBeat = songEndBeat;
  let nextStartBeat: number | null = null;

  for (const region of otherRegions) {
    if (region.getStartFromBeat() < proposedStartBeat) {
      minStartBeat = Math.max(minStartBeat, region.getStartFromBeat() + region.getLength());
      continue;
    }

    maxEndBeat = Math.min(maxEndBeat, region.getStartFromBeat());
    nextStartBeat = region.getStartFromBeat();
    break;
  }

  return { minStartBeat, maxEndBeat, nextStartBeat };
}

export function findChordRegionAtBeat(project: KGProject, beat: number): KGChordRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Chord);
  if (!track) {
    return null;
  }

  return track.getRegions()
    .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
    .find(region => beat >= region.getStartFromBeat() && beat < region.getStartFromBeat() + region.getLength()) ?? null;
}

export function getSongEndBar(project: KGProject): number {
  return project.getMaxBars();
}

export function getSortedTempoRegions(track: KGGlobalTrack, beatsPerBar: number): KGTempoRegion[] {
  return track.getRegions()
    .filter((region): region is KGTempoRegion => region instanceof KGTempoRegion)
    .map((region) => {
      region.syncBarsFromBeats(beatsPerBar);
      region.syncBeatsFromBars(beatsPerBar);
      return region;
    })
    .sort((left, right) => left.getStartBar() - right.getStartBar());
}

export function cloneTempoRegions(regions: KGTempoRegion[], beatsPerBar: number): KGTempoRegion[] {
  return regions.map(region => new KGTempoRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getBpm(),
    region.getStartBar(),
    region.getLengthBars(),
    beatsPerBar
  ));
}

export function getSortedKeySignatureRegions(track: KGGlobalTrack, beatsPerBar: number): KGKeySignatureRegion[] {
  return track.getRegions()
    .filter((region): region is KGKeySignatureRegion => region instanceof KGKeySignatureRegion)
    .map((region) => {
      region.syncBarsFromBeats(beatsPerBar);
      region.syncBeatsFromBars(beatsPerBar);
      return region;
    })
    .sort((left, right) => left.getStartBar() - right.getStartBar());
}

export function cloneKeySignatureRegions(regions: KGKeySignatureRegion[], beatsPerBar: number): KGKeySignatureRegion[] {
  return regions.map(region => new KGKeySignatureRegion(
    region.getId(),
    region.getTrackId(),
    region.getTrackIndex(),
    region.getKeySignature(),
    region.getStartBar(),
    region.getLengthBars(),
    beatsPerBar
  ));
}

export function findKeySignatureRegionAtBar(project: KGProject, bar: number): KGKeySignatureRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Signature);
  if (!track) {
    return null;
  }

  const beatsPerBar = project.getTimeSignature().numerator;
  return getSortedKeySignatureRegions(track, beatsPerBar)
    .find(region => bar >= region.getStartBar() && bar < region.getEndBar()) ?? null;
}

export function findKeySignatureRegionAtBeat(project: KGProject, beat: number): KGKeySignatureRegion | null {
  const beatsPerBar = project.getTimeSignature().numerator;
  const bar = Math.floor(beat / beatsPerBar);
  return findKeySignatureRegionAtBar(project, bar);
}

export function findTempoRegionAtBar(project: KGProject, bar: number): KGTempoRegion | null {
  const track = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!track) {
    return null;
  }

  const beatsPerBar = project.getTimeSignature().numerator;
  return getSortedTempoRegions(track, beatsPerBar)
    .find(region => bar >= region.getStartBar() && bar < region.getEndBar()) ?? null;
}

export function findTempoRegionAtBeat(project: KGProject, beat: number): KGTempoRegion | null {
  const beatsPerBar = project.getTimeSignature().numerator;
  const bar = Math.floor(beat / beatsPerBar);
  return findTempoRegionAtBar(project, bar);
}

export function getEffectiveKeySignatureAtBeat(project: KGProject, beat: number): KeySignature {
  return findKeySignatureRegionAtBeat(project, beat)?.getKeySignature() ?? project.getKeySignature();
}

export function getEffectiveBpmAtBar(project: KGProject, bar: number): number {
  return findTempoRegionAtBar(project, bar)?.getBpm() ?? project.getBpm();
}

export function getEffectiveBpmAtBeat(project: KGProject, beat: number): number {
  return findTempoRegionAtBeat(project, beat)?.getBpm() ?? project.getBpm();
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

  const beatsPerBar = project.getTimeSignature().numerator;
  const songEndBar = getSongEndBar(project);
  const regions = getSortedTempoRegions(track, beatsPerBar);
  if (regions.length === 0) {
    return;
  }

  const normalized: KGTempoRegion[] = [];
  let currentBar = 0;

  for (const region of regions) {
    if (currentBar >= songEndBar) {
      break;
    }

    const startBar = Math.max(currentBar, region.getStartBar());
    const endBar = Math.max(startBar + 1, Math.min(region.getEndBar(), songEndBar));
    if (endBar <= startBar) {
      continue;
    }

    normalized.push(new KGTempoRegion(
      region.getId(),
      track.getId(),
      track.getTrackIndex(),
      region.getBpm(),
      startBar,
      endBar - startBar,
      beatsPerBar
    ));
    currentBar = endBar;
  }

  if (normalized.length === 0) {
    track.setRegions([]);
    return;
  }

  const firstRegion = normalized[0];
  if (firstRegion.getStartBar() > 0) {
    firstRegion.setBarRange(0, firstRegion.getEndBar(), beatsPerBar);
  }

  const lastRegion = normalized[normalized.length - 1];
  if (lastRegion.getEndBar() < songEndBar) {
    lastRegion.setLengthBars(songEndBar - lastRegion.getStartBar(), beatsPerBar);
  } else if (lastRegion.getEndBar() > songEndBar) {
    lastRegion.setLengthBars(songEndBar - lastRegion.getStartBar(), beatsPerBar);
  }

  track.setRegions(normalized);
}

export function beatToSeconds(project: KGProject, beat: number): number {
  const clampedBeat = Math.max(0, beat);
  const timeSignature = project.getTimeSignature?.();
  const beatsPerBar = timeSignature?.numerator ?? 4;
  const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!tempoTrack) {
    return clampedBeat * 60 / project.getBpm();
  }

  const tempoRegions = getSortedTempoRegions(tempoTrack, beatsPerBar);
  if (tempoRegions.length === 0) {
    return clampedBeat * 60 / project.getBpm();
  }

  let seconds = 0;
  let traversedBeat = 0;

  for (const region of tempoRegions) {
    const regionStartBeat = region.getStartBar() * beatsPerBar;
    const regionEndBeat = region.getEndBar() * beatsPerBar;
    const effectiveStartBeat = Math.max(traversedBeat, regionStartBeat);
    if (clampedBeat <= effectiveStartBeat) {
      return seconds;
    }

    const coveredEndBeat = Math.min(clampedBeat, regionEndBeat);
    if (coveredEndBeat > effectiveStartBeat) {
      seconds += (coveredEndBeat - effectiveStartBeat) * (60 / region.getBpm());
    }

    if (clampedBeat <= regionEndBeat) {
      return seconds;
    }

    traversedBeat = regionEndBeat;
  }

  return seconds + Math.max(0, clampedBeat - traversedBeat) * (60 / project.getBpm());
}

export function beatRangeToSeconds(project: KGProject, startBeat: number, endBeat: number): number {
  if (endBeat <= startBeat) {
    return 0;
  }

  return beatToSeconds(project, endBeat) - beatToSeconds(project, startBeat);
}

export function secondsToBeat(project: KGProject, seconds: number): number {
  const clampedSeconds = Math.max(0, seconds);
  const timeSignature = project.getTimeSignature?.();
  const beatsPerBar = timeSignature?.numerator ?? 4;
  const tempoTrack = findGlobalTrackByType(project, GlobalTrackType.Tempo);
  if (!tempoTrack) {
    return clampedSeconds / (60 / project.getBpm());
  }

  const tempoRegions = getSortedTempoRegions(tempoTrack, beatsPerBar);
  if (tempoRegions.length === 0) {
    return clampedSeconds / (60 / project.getBpm());
  }

  let remainingSeconds = clampedSeconds;
  let traversedBeat = 0;

  for (const region of tempoRegions) {
    const regionStartBeat = region.getStartBar() * beatsPerBar;
    const regionEndBeat = region.getEndBar() * beatsPerBar;
    const effectiveStartBeat = Math.max(traversedBeat, regionStartBeat);
    const regionDurationSeconds = (regionEndBeat - effectiveStartBeat) * (60 / region.getBpm());

    if (remainingSeconds <= regionDurationSeconds) {
      return effectiveStartBeat + (remainingSeconds / (60 / region.getBpm()));
    }

    remainingSeconds -= regionDurationSeconds;
    traversedBeat = regionEndBeat;
  }

  return traversedBeat + remainingSeconds / (60 / project.getBpm());
}

export function getAudioRegionDisplayLengthBeats(project: KGProject, region: KGAudioRegion): number {
  if (!project.getTimeSignature?.() || !project.getBpm?.()) {
    return region.getLength();
  }

  const startBeat = region.getStartFromBeat();
  const availableAudioSeconds = Math.max(0, region.getAudioDurationSeconds() - region.getClipStartOffsetSeconds());
  const endBeat = getAudioRegionPlaybackEndBeat(project, region);
  return Math.max(0, endBeat - startBeat);
}

export function getAudioRegionPlaybackEndBeat(project: KGProject, region: KGAudioRegion): number {
  const startBeat = region.getStartFromBeat();
  const availableAudioSeconds = Math.max(0, region.getAudioDurationSeconds() - region.getClipStartOffsetSeconds());
  if (availableAudioSeconds <= 0) {
    return startBeat;
  }

  const targetSeconds = beatToSeconds(project, startBeat) + availableAudioSeconds;
  const songEndBeat = getSongEndBeat(project);
  const songEndSeconds = beatToSeconds(project, songEndBeat);

  if (targetSeconds <= songEndSeconds) {
    return secondsToBeat(project, targetSeconds);
  }

  const tailBpm = getEffectiveBpmAtBeat(project, Math.max(0, songEndBeat - 1e-6));
  return songEndBeat + ((targetSeconds - songEndSeconds) / (60 / tailBpm));
}

export function getRequiredMaxBarsForAudioRegions(project: KGProject): number {
  const beatsPerBar = project.getTimeSignature().numerator;
  let requiredBars = project.getMaxBars();

  for (const track of project.getTracks()) {
    for (const region of track.getRegions()) {
      if (!(region instanceof KGAudioRegion)) {
        continue;
      }

      const regionEndBeat = getAudioRegionPlaybackEndBeat(project, region);
      const regionRequiredBars = Math.ceil(regionEndBeat / beatsPerBar);
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

      const nextLength = Math.max(0, getAudioRegionPlaybackEndBeat(project, region) - region.getStartFromBeat());
      if (region.getLength() === nextLength) {
        continue;
      }

      changedRegions.push({
        region,
        length: region.getLength(),
      });
      region.setLength(nextLength);
    }
  }

  return changedRegions;
}

export function restoreAudioRegionLengths(snapshots: AudioRegionLengthSnapshot[]): void {
  snapshots.forEach(({ region, length }) => {
    region.setLength(length);
  });
}
