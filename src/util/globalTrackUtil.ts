import { KGProject } from '../core/KGProject';
import type { KeySignature } from '../core/KGProject';
import {
  GlobalTrackType,
  KGGlobalTrack,
  createDefaultGlobalTracks,
} from '../core/global-track';
import { KGGlobalRegion } from '../core/region/KGGlobalRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';

export const DEFAULT_MARKER_REGION_NAME = 'Marker';

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
  return project.getGlobalTracks().find(track => track.getType() === type) ?? null;
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
  const markerTrack = findGlobalTrackByType(project, GlobalTrackType.Marker);
  const songEndBeat = getSongEndBeat(project);

  if (!markerTrack) {
    return { minStartBeat: 0, maxEndBeat: songEndBeat, nextStartBeat: null };
  }

  const otherRegions = markerTrack.getRegions()
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

export function getSongEndBar(project: KGProject): number {
  return project.getMaxBars();
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

export function getEffectiveKeySignatureAtBeat(project: KGProject, beat: number): KeySignature {
  return findKeySignatureRegionAtBeat(project, beat)?.getKeySignature() ?? project.getKeySignature();
}

export function getClampedKeySignatureRegionEndBar(region: KGKeySignatureRegion, maxBars: number): number {
  return Math.max(region.getStartBar(), Math.min(region.getEndBar(), maxBars));
}
