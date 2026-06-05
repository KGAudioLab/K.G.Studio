import { KGCore } from '../../core/KGCore';
import { KGRegion } from '../../core/region/KGRegion';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGGlobalRegion } from '../../core/region/KGGlobalRegion';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGTrack } from '../../core/track/KGTrack';
import { useProjectStore } from '../../stores/projectStore';

export const NO_MIDI_TARGET_RAW_MESSAGE =
  'No MIDI target could be resolved. Select the MIDI region you want me to edit and retry, or tell me which MIDI track to operate on by providing its track_id.';

export const NO_MIDI_TARGET_HISTORY_MESSAGE =
  'I could not tell which MIDI content to edit. Select a MIDI region and retry, or tell me which track I should work on.';

export const NO_MIDI_TARGET_UI_MESSAGE =
  'Select a MIDI region, or specify a track.';

export interface ActiveMidiRegionContext {
  region: KGMidiRegion;
  track: KGMidiTrack;
  trackName: string;
}

export interface SelectedMusicRangeContext {
  section: string;
  startBeat: number | null;
  endBeat: number | null;
  hasRange: boolean;
}

export interface SelectedTrackContext {
  track: KGTrack | null;
  trackId: string | null;
  trackName: string | null;
  hasSelectedTrack: boolean;
}

export function getTrackDisplayName(track: { getName(): string; getTrackIndex(): number }): string {
  return track.getName() || `Track ${track.getTrackIndex() + 1}`;
}

export function resolveMidiTrackByIdOrName(
  trackId: string | undefined,
  trackName: string | undefined,
): KGMidiTrack | null {
  const project = KGCore.instance().getCurrentProject();
  const midiTracks = project.getTracks().filter((track): track is KGMidiTrack => track instanceof KGMidiTrack);

  if (trackId) {
    return midiTracks.find(track => track.getId().toString() === trackId) ?? null;
  }

  if (trackName) {
    return midiTracks.find(track => track.getName() === trackName) ?? null;
  }

  return null;
}

export function findRegionById(regionId: string): KGRegion | null {
  const project = KGCore.instance().getCurrentProject();

  for (const track of project.getTracks()) {
    const region = track.getRegions().find(candidate => candidate.getId() === regionId);
    if (region) {
      return region;
    }
  }

  for (const globalTrack of project.getGlobalTracks()) {
    const region = globalTrack.getRegions().find(candidate => candidate.getId() === regionId);
    if (region) {
      return region;
    }
  }

  return null;
}

export function findRegularTrackByRegion(region: KGRegion): KGTrack | null {
  const project = KGCore.instance().getCurrentProject();
  return project.getTracks().find(track => track.getRegions().includes(region)) ?? null;
}

export function resolveSelectedMusicRangeContext(): SelectedMusicRangeContext {
  const project = KGCore.instance().getCurrentProject();
  const storeState = useProjectStore.getState();

  if (project.getIsLooping()) {
    const beatsPerBar = project.getTimeSignature().numerator;
    const [loopStartBar, loopEndBar] = project.getLoopingRange();
    const startBeat = loopStartBar * beatsPerBar;
    const endBeat = (loopEndBar + 1) * beatsPerBar;
    return {
      section: `- Start Beat: ${startBeat}\n- End Beat: ${endBeat}`,
      startBeat,
      endBeat,
      hasRange: true,
    };
  }

  const selectedRegions = (storeState.selectedRegionIds ?? [])
    .map(regionId => findRegionById(regionId))
    .filter((region): region is KGRegion => region !== null);

  if (selectedRegions.length === 0) {
    return {
      section: '- No selected music range.',
      startBeat: null,
      endBeat: null,
      hasRange: false,
    };
  }

  const startBeat = Math.min(...selectedRegions.map(region => region.getStartFromBeat()));
  const endBeat = Math.max(...selectedRegions.map(region => region.getStartFromBeat() + region.getLength()));

  return {
    section: `- Start Beat: ${startBeat}\n- End Beat: ${endBeat}`,
    startBeat,
    endBeat,
    hasRange: true,
  };
}

export function resolveSelectedTrackContext(): SelectedTrackContext {
  const project = KGCore.instance().getCurrentProject();
  const storeState = useProjectStore.getState();
  const selectedRegionIds = storeState.selectedRegionIds ?? [];

  if (selectedRegionIds.length === 0) {
    return {
      track: null,
      trackId: null,
      trackName: null,
      hasSelectedTrack: false,
    };
  }

  const selectedRegions = selectedRegionIds
    .map(regionId => findRegionById(regionId))
    .filter((region): region is KGRegion => region !== null);

  if (selectedRegions.length === 0 || selectedRegions.every(region => region instanceof KGGlobalRegion)) {
    return {
      track: null,
      trackId: null,
      trackName: null,
      hasSelectedTrack: false,
    };
  }

  const selectedTrackId = storeState.selectedTrackId;
  const selectedTrack = selectedTrackId
    ? project.getTracks().find(track => track.getId().toString() === selectedTrackId) ?? null
    : null;

  if (!selectedTrack) {
    return {
      track: null,
      trackId: null,
      trackName: null,
      hasSelectedTrack: false,
    };
  }

  return {
    track: selectedTrack,
    trackId: selectedTrack.getId().toString(),
    trackName: getTrackDisplayName(selectedTrack),
    hasSelectedTrack: true,
  };
}

export function resolveActiveOrSelectedMidiRegionContext(): ActiveMidiRegionContext | null {
  const project = KGCore.instance().getCurrentProject();
  const tracks = project.getTracks();
  const midiTracks = tracks.filter((track): track is KGMidiTrack => track instanceof KGMidiTrack);
  const storeState = useProjectStore.getState();

  if (storeState.activeRegionId) {
    for (const track of midiTracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === storeState.activeRegionId);
      if (region instanceof KGMidiRegion) {
        return {
          region,
          track,
          trackName: getTrackDisplayName(track),
        };
      }
    }
  }

  const selectedItems = KGCore.instance().getSelectedItems();
  for (const item of selectedItems) {
    if (!(item instanceof KGMidiRegion)) {
      continue;
    }

    const track = midiTracks.find(candidate => candidate.getId().toString() === item.getTrackId());
    if (track) {
      return {
        region: item,
        track,
        trackName: getTrackDisplayName(track),
      };
    }
  }

  return null;
}
