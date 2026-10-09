import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { getTrackDisplayName, resolveMidiTrackByIdOrName, resolveActiveOrSelectedMidiRegionContext } from './toolTargeting';

export interface NoteSpan {
  startTick: number;
  endTick: number;
}

export interface ResolvedRegionContext {
  track: KGMidiTrack;
  trackName: string;
  regionName: string;
  regionId?: string;
  finalRegionStartTick: number;
  finalRegionLength: number;
  createdRegion: boolean;
}

export function resolveMidiRegionTarget(
  trackId: string | undefined,
  trackName: string | undefined,
  span: NoteSpan,
  minimumNewRegionLength = 0,
): ResolvedRegionContext | null {
  if (trackId || trackName) {
    return resolveTrackTarget(trackId, trackName, span, minimumNewRegionLength);
  }

  const activeRegion = resolveActiveOrSelectedMidiRegionContext();
  if (!activeRegion) {
    return null;
  }

  const region = activeRegion.region;
  const regionStartTick = region.getStartTick();
  const regionEndTick = regionStartTick + region.getLengthTicks();
  return {
    track: activeRegion.track,
    trackName: activeRegion.trackName,
    regionId: region.getId(),
    regionName: region.getName(),
    finalRegionStartTick: Math.min(regionStartTick, span.startTick),
    finalRegionLength: Math.max(regionEndTick, span.endTick) - Math.min(regionStartTick, span.startTick),
    createdRegion: false,
  };
}

function resolveTrackTarget(
  trackId: string | undefined,
  trackName: string | undefined,
  span: NoteSpan,
  minimumNewRegionLength = 0,
): ResolvedRegionContext | null {
  const track = resolveMidiTrackByIdOrName(trackId, trackName);
  if (!track) {
    return null;
  }

  const resolvedTrackName = getTrackDisplayName(track);
  const midiRegions = track.getRegions().filter(region => region instanceof KGMidiRegion) as KGMidiRegion[];
  const selectedRegion = pickBestOverlappingRegion(midiRegions, span);

  if (!selectedRegion) {
    return {
      track,
      trackName: resolvedTrackName,
      regionName: `${resolvedTrackName} Region`,
      finalRegionStartTick: span.startTick,
      finalRegionLength: Math.max(minimumNewRegionLength, span.endTick - span.startTick),
      createdRegion: true,
    };
  }

  const regionStartTick = selectedRegion.getStartTick();
  const regionEndTick = regionStartTick + selectedRegion.getLengthTicks();
  const finalRegionStartTick = Math.min(regionStartTick, span.startTick);
  const finalRegionEndTick = Math.max(regionEndTick, span.endTick);

  return {
    track,
    trackName: resolvedTrackName,
    regionId: selectedRegion.getId(),
    regionName: selectedRegion.getName(),
    finalRegionStartTick,
    finalRegionLength: finalRegionEndTick - finalRegionStartTick,
    createdRegion: false,
  };
}

function pickBestOverlappingRegion(regions: KGMidiRegion[], span: NoteSpan): KGMidiRegion | null {
  let bestRegion: KGMidiRegion | null = null;
  let bestOverlap = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    const regionStart = region.getStartTick();
    const regionEnd = regionStart + region.getLengthTicks();
    const overlap = Math.min(regionEnd, span.endTick) - Math.max(regionStart, span.startTick);
    if (overlap <= 0) {
      continue;
    }

    const distance = Math.abs(regionStart - span.startTick);
    if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
      bestRegion = region;
      bestOverlap = overlap;
      bestDistance = distance;
    }
  }

  return bestRegion;
}

