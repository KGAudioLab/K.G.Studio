import { useCallback, useEffect, useRef, useState } from 'react';
import { KGCore } from '../core/KGCore';
import { KGGlobalTrack } from '../core/global-track';
import { KGTrack } from '../core/track/KGTrack';
import { KGRegion } from '../core/region/KGRegion';
import { KGGlobalRegion } from '../core/region/KGGlobalRegion';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGMarkerRegion } from '../core/region/KGMarkerRegion';
import type { RegionClickOptions, RegionUI } from '../components/interfaces';
import { DEBUG_MODE } from '../constants';
import { useProjectStore } from '../stores/projectStore';
import { useRegionOperations } from './useRegionOperations';
import { getAudioRegionDisplayLengthBeats } from '../util/globalTrackUtil';
import { resolveRegionColor } from '../util/regionColor';
import type { PianoRollMode } from '../constants';

const DEFAULT_REGION_CLICK_OPTIONS: RegionClickOptions = {
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
};

interface UseMainContentRegionsParams {
  tracks: KGTrack[];
  globalTracks: KGGlobalTrack[];
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  clearAllSelections: () => void;
  setSelectedTrack: (trackId: string) => void;
  showPianoRoll: boolean;
  activeRegionId: string | null;
  setShowPianoRoll: (show: boolean) => void;
  setActiveRegionId: (regionId: string | null) => void;
  openMidiPianoRoll: (regionId: string) => void;
  openAudioWaveformViewer: (regionId: string) => void;
  openSpectrogramViewer: (regionId: string) => void;
  openHybridMode: (midiRegionId: string, audioRegionId: string) => void;
  openMidiReferenceMode: (mainRegionId: string, referenceRegionId: string) => void;
  pianoRollMode: PianoRollMode;
  updateTrack: (track: KGTrack) => void;
  maxBars: number;
}

interface MainContentSelectionState {
  selectedRegionId: string | null;
  findProjectRegionById: (regionId: string) => KGRegion | null;
  isGlobalRegionId: (regionId: string) => boolean;
  selectGlobalRegion: (regionId: string, options?: RegionClickOptions) => void;
}

export interface UseMainContentRegionsResult {
  regions: RegionUI[];
  deleteSelectedRegions: () => boolean;
  selection: MainContentSelectionState;
  handleRegionCreated: (trackIndex: number, regionUI: RegionUI, midiRegion: KGMidiRegion) => void;
  handleExternalDropComplete: (trackIndex: number, regionUI: RegionUI) => void;
  handleRegionUpdated: (
    regionId: string,
    updates: Partial<RegionUI>,
    expectedModelUpdates?: { startBeat: number; length: number }
  ) => void;
  handleRegionClick: (regionId: string, options?: RegionClickOptions) => void;
  handleRegionLassoSelection: (regionIds: string[], options?: RegionClickOptions) => void;
  handleRegionLassoCommit: () => void;
  handleEmptyMainContentClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  handleOpenPianoRoll: (regionId: string) => void;
  handleOpenWaveform: (regionId: string) => void;
  handleOpenSpectrogram: (regionId: string) => void;
  handleOpenHybrid: (regionId: string) => void;
}

export function useMainContentRegions({
  tracks,
  globalTracks,
  timeSignature,
  selectedRegionIds,
  clearAllSelections,
  setSelectedTrack,
  showPianoRoll,
  activeRegionId,
  setShowPianoRoll,
  setActiveRegionId,
  openMidiPianoRoll,
  openAudioWaveformViewer,
  openSpectrogramViewer,
  openHybridMode,
  openMidiReferenceMode,
  pianoRollMode,
  updateTrack,
  maxBars,
}: UseMainContentRegionsParams): UseMainContentRegionsResult {
  const [regions, setRegions] = useState<RegionUI[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const pendingUpdates = useRef<Map<string, { trackId: string; regionId: string; startBeat: number; length: number }>>(new Map());
  const preventEmptyMainContentDeselectRef = useRef(false);
  const pendingAutoSelectionRegionIdRef = useRef<string | null>(null);

  const { deleteSelectedRegions } = useRegionOperations({
    tracks,
    updateTrack,
    setRegions,
    selectedRegionId,
    setSelectedRegionId,
    showPianoRoll,
    setShowPianoRoll,
    activeRegionId,
    setActiveRegionId,
  });

  const findProjectRegionById = useCallback((regionId: string): KGRegion | null => {
    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === regionId);
      if (region) {
        return region;
      }
    }

    for (const globalTrack of globalTracks) {
      const region = globalTrack.getRegions().find(candidate => candidate.getId() === regionId);
      if (region) {
        return region;
      }
    }

    return null;
  }, [globalTracks, tracks]);

  const isGlobalRegionId = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    return region instanceof KGGlobalRegion;
  }, [findProjectRegionById]);

  useEffect(() => {
    if (pendingUpdates.current.size === 0) {
      return;
    }

    const updates = new Map(pendingUpdates.current);
    pendingUpdates.current.clear();

    updates.forEach(update => {
      const { trackId, regionId, startBeat, length } = update;
      const track = tracks.find(candidate => candidate.getId().toString() === trackId);
      if (!track) {
        return;
      }

      const region = track.getRegions().find(candidate => candidate.getId() === regionId);
      if (region && DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Verification - Region ${regionId} in track ${trackId}:`);
        console.log(`  Expected: startBeat=${startBeat}, length=${length}`);
        console.log(`  Actual: startBeat=${region.getStartFromBeat()}, length=${region.getLength()}, trackId=${region.getTrackId()}, trackIndex=${region.getTrackIndex()}`);
        const success = region.getStartFromBeat() === startBeat && region.getLength() === length && region.getTrackId() === trackId;
        console.log(`  Update successful: ${success}`);
      }
    });
  }, [tracks]);

  useEffect(() => {
    const updatedRegions: RegionUI[] = [];

    tracks.forEach(track => {
      const trackId = track.getId().toString();
      const trackIndex = track.getTrackIndex();

      track.getRegions().forEach(region => {
        if (region instanceof KGMidiRegion || region instanceof KGAudioRegion) {
          const beatsPerBar = timeSignature.numerator;
          const barNumber = (region.getStartFromBeat() / beatsPerBar) + 1;
          const lengthBeats = region instanceof KGAudioRegion
            ? getAudioRegionDisplayLengthBeats(KGCore.instance().getCurrentProject(), region)
            : region.getLength();
          const length = lengthBeats / beatsPerBar;

          updatedRegions.push({
            id: region.getId(),
            trackId,
            trackIndex,
            barNumber,
            length,
            name: region.getName(),
            color: region.getColor(),
            trackColor: track.getColor(),
            effectiveColor: resolveRegionColor(region.getColor(), track.getColor(), region instanceof KGAudioRegion),
            isAudioRegion: region instanceof KGAudioRegion,
          });
        }
      });
    });

    setRegions(updatedRegions);
  }, [globalTracks, timeSignature, tracks]);

  useEffect(() => {
    if (!showPianoRoll || !activeRegionId) {
      return;
    }

    const activeRegionStillExists = tracks.some(track =>
      track.getRegions().some(region => region.getId() === activeRegionId)
    );

    if (!activeRegionStillExists) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
    }
  }, [tracks, showPianoRoll, activeRegionId, setShowPianoRoll, setActiveRegionId]);

  const applyRegionSelection = useCallback((orderedSelectionIds: string[]) => {
    const core = KGCore.instance();
    const allRegions = [
      ...tracks.flatMap(projectTrack => projectTrack.getRegions()),
      ...globalTracks.flatMap(globalTrack => globalTrack.getRegions()),
    ];

    allRegions.forEach(projectRegion => projectRegion.deselect());
    clearAllSelections();

    const selectedRegions: KGRegion[] = orderedSelectionIds
      .map(selectedId => allRegions.find(region => region.getId() === selectedId) ?? null)
      .filter((selectedRegion): selectedRegion is KGRegion => selectedRegion !== null);

    selectedRegions.forEach(selectedRegion => selectedRegion.select());

    if (selectedRegions.length > 0) {
      core.addSelectedItems(selectedRegions);
    }

    const lastSelectedRegion = selectedRegions.length > 0
      ? selectedRegions[selectedRegions.length - 1]
      : null;
    const lastSelectedRegionId = lastSelectedRegion?.getId() ?? null;

    setSelectedRegionId(lastSelectedRegionId);
    if (lastSelectedRegionId && lastSelectedRegion && !(lastSelectedRegion instanceof KGGlobalRegion)) {
      setActiveRegionId(lastSelectedRegionId);
    }

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Selected regions: ${selectedRegions.map(selectedRegion => selectedRegion.getId()).join(', ')}`);
    }

    if (!showPianoRoll || !lastSelectedRegionId || !lastSelectedRegion || lastSelectedRegion instanceof KGGlobalRegion) {
      return;
    }

    if (lastSelectedRegion instanceof KGAudioRegion) {
      openAudioWaveformViewer(lastSelectedRegionId);
    } else if (lastSelectedRegion instanceof KGMidiRegion) {
      openMidiPianoRoll(lastSelectedRegionId);
    }
  }, [
    clearAllSelections,
    globalTracks,
    openAudioWaveformViewer,
    openMidiPianoRoll,
    setActiveRegionId,
    showPianoRoll,
    tracks,
  ]);

  const isAdditiveSelection = useCallback((options: RegionClickOptions) => options.metaKey || options.ctrlKey, []);

  const getOrderedTrackRegionIds = useCallback((trackId: string) => (
    regions
      .filter(region => region.trackId === trackId)
      .sort((left, right) => {
        if (left.barNumber !== right.barNumber) {
          return left.barNumber - right.barNumber;
        }

        if (left.length !== right.length) {
          return left.length - right.length;
        }

        return left.id.localeCompare(right.id);
      })
      .map(region => region.id)
  ), [regions]);

  const getOrderedGlobalRegionIds = useCallback((regionType: 'marker' | 'tempo' | 'signature' | 'chord') => (
    globalTracks
      .flatMap(globalTrack => globalTrack.getRegions())
      .filter((region): region is KGGlobalRegion => {
        if (regionType === 'tempo') {
          return region instanceof KGTempoRegion;
        }

        if (regionType === 'signature') {
          return region instanceof KGKeySignatureRegion;
        }

        if (regionType === 'chord') {
          return region instanceof KGChordRegion;
        }

        return region instanceof KGMarkerRegion;
      })
      .sort((left, right) => {
        const leftStart = left instanceof KGTempoRegion || left instanceof KGKeySignatureRegion
          ? left.getStartBar()
          : Math.round(left.getStartFromBeat() / timeSignature.numerator);
        const rightStart = right instanceof KGTempoRegion || right instanceof KGKeySignatureRegion
          ? right.getStartBar()
          : Math.round(right.getStartFromBeat() / timeSignature.numerator);

        if (leftStart !== rightStart) {
          return leftStart - rightStart;
        }

        const leftLength = left instanceof KGTempoRegion || left instanceof KGKeySignatureRegion
          ? left.getLengthBars()
          : left.getLength();
        const rightLength = right instanceof KGTempoRegion || right instanceof KGKeySignatureRegion
          ? right.getLengthBars()
          : right.getLength();

        if (leftLength !== rightLength) {
          return leftLength - rightLength;
        }

        return left.getId().localeCompare(right.getId());
      })
      .map(region => region.getId())
  ), [globalTracks, timeSignature.numerator]);

  const appendPrimarySelection = useCallback((orderedIds: string[], primaryRegionId: string) => {
    const deduped = orderedIds.filter(id => id !== primaryRegionId);
    return [...deduped, primaryRegionId];
  }, []);

  const buildSameTrackRangeSelection = useCallback((
    existingRegularSelectionIds: string[],
    anchorRegionId: string,
    targetRegionId: string,
    orderedTrackRegionIds: string[]
  ) => {
    const anchorIndex = orderedTrackRegionIds.indexOf(anchorRegionId);
    const targetIndex = orderedTrackRegionIds.indexOf(targetRegionId);
    if (anchorIndex === -1 || targetIndex === -1) {
      return [targetRegionId];
    }

    const [startIndex, endIndex] = anchorIndex <= targetIndex
      ? [anchorIndex, targetIndex]
      : [targetIndex, anchorIndex];
    const rangeIds = orderedTrackRegionIds.slice(startIndex, endIndex + 1);
    const rangeIdSet = new Set(rangeIds);
    const preservedOtherTrackIds = existingRegularSelectionIds.filter(selectedId => !rangeIdSet.has(selectedId));
    return appendPrimarySelection([...preservedOtherTrackIds, ...rangeIds], targetRegionId);
  }, [appendPrimarySelection]);

  const buildSameLaneRangeSelection = useCallback((
    existingGlobalSelectionIds: string[],
    anchorRegionId: string,
    targetRegionId: string,
    orderedLaneRegionIds: string[]
  ) => {
    const anchorIndex = orderedLaneRegionIds.indexOf(anchorRegionId);
    const targetIndex = orderedLaneRegionIds.indexOf(targetRegionId);
    if (anchorIndex === -1 || targetIndex === -1) {
      return [targetRegionId];
    }

    const [startIndex, endIndex] = anchorIndex <= targetIndex
      ? [anchorIndex, targetIndex]
      : [targetIndex, anchorIndex];
    const rangeIds = orderedLaneRegionIds.slice(startIndex, endIndex + 1);
    const laneIdSet = new Set(orderedLaneRegionIds);
    const preservedOtherLaneIds = existingGlobalSelectionIds.filter(selectedId => !laneIdSet.has(selectedId));
    return appendPrimarySelection([...preservedOtherLaneIds, ...rangeIds], targetRegionId);
  }, [appendPrimarySelection]);

  const getGlobalRegionLaneType = useCallback((region: KGGlobalRegion): 'marker' | 'tempo' | 'signature' | 'chord' => {
    if (region instanceof KGTempoRegion) {
      return 'tempo';
    }

    if (region instanceof KGKeySignatureRegion) {
      return 'signature';
    }

    if (region instanceof KGChordRegion) {
      return 'chord';
    }

    return 'marker';
  }, []);

  const selectRegion = useCallback((
    regionId: string,
    options: RegionClickOptions = DEFAULT_REGION_CLICK_OPTIONS,
    regionsToSearch?: RegionUI[]
  ) => {
    const regionsToUse = regionsToSearch || regions;
    const region = regionsToUse.find(candidate => candidate.id === regionId);
    if (!region) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region not found in UI state: ${regionId}`);
      }
      return;
    }

    const track = tracks.find(candidate => candidate.getId().toString() === region.trackId);
    if (!track) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Track not found for region: ${regionId}`);
      }
      return;
    }

    const coreRegion = track.getRegions().find(candidate => candidate.getId() === regionId);
    if (!coreRegion) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region not found in track model: ${regionId}`);
      }
      return;
    }

    const regularSelectedRegionIds = selectedRegionIds.filter(selectedId => !isGlobalRegionId(selectedId));
    const additiveSelection = isAdditiveSelection(options);
    let orderedSelection: string[];

    if (additiveSelection) {
      orderedSelection = regularSelectedRegionIds.includes(regionId)
        ? regularSelectedRegionIds.filter(id => id !== regionId)
        : appendPrimarySelection([...regularSelectedRegionIds, regionId], regionId);
    } else if (options.shiftKey) {
      const anchorRegionId = regularSelectedRegionIds[regularSelectedRegionIds.length - 1] ?? null;
      const anchorRegion = anchorRegionId
        ? regionsToUse.find(candidate => candidate.id === anchorRegionId)
        : null;

      if (!anchorRegionId) {
        orderedSelection = [regionId];
      } else if (anchorRegion?.trackId === region.trackId) {
        orderedSelection = buildSameTrackRangeSelection(
          regularSelectedRegionIds,
          anchorRegionId,
          regionId,
          getOrderedTrackRegionIds(region.trackId)
        );
      } else {
        orderedSelection = regularSelectedRegionIds.includes(regionId)
          ? regularSelectedRegionIds.filter(id => id !== regionId)
          : appendPrimarySelection([...regularSelectedRegionIds, regionId], regionId);
      }
    } else {
      orderedSelection = [regionId];
    }

    applyRegionSelection(orderedSelection);
  }, [
    appendPrimarySelection,
    applyRegionSelection,
    buildSameTrackRangeSelection,
    getOrderedTrackRegionIds,
    isAdditiveSelection,
    isGlobalRegionId,
    regions,
    selectedRegionIds,
    tracks,
  ]);

  const selectGlobalRegion = useCallback((regionId: string, options: RegionClickOptions = DEFAULT_REGION_CLICK_OPTIONS) => {
    const globalSelectedRegionIds = selectedRegionIds.filter(selectedId => isGlobalRegionId(selectedId));
    const globalRegion = findProjectRegionById(regionId);
    if (!(globalRegion instanceof KGGlobalRegion)) {
      return;
    }

    const targetLaneType = getGlobalRegionLaneType(globalRegion);
    const sameLaneSelectedRegionIds = globalSelectedRegionIds.filter(selectedId => {
      const selectedRegion = findProjectRegionById(selectedId);
      return selectedRegion instanceof KGGlobalRegion && getGlobalRegionLaneType(selectedRegion) === targetLaneType;
    });

    const additiveSelection = isAdditiveSelection(options);
    let orderedSelection: string[];

    if (additiveSelection) {
      orderedSelection = sameLaneSelectedRegionIds.includes(regionId)
        ? sameLaneSelectedRegionIds.filter(id => id !== regionId)
        : appendPrimarySelection([...sameLaneSelectedRegionIds, regionId], regionId);
    } else if (options.shiftKey) {
      const orderedLaneRegionIds = getOrderedGlobalRegionIds(targetLaneType);
      const laneRegionIdSet = new Set(orderedLaneRegionIds);
      const sameLaneSelectedIds = sameLaneSelectedRegionIds.filter(selectedId => laneRegionIdSet.has(selectedId));
      const anchorRegionId = [...sameLaneSelectedIds].reverse().find(selectedId => selectedId !== regionId) ?? null;

      if (!anchorRegionId) {
        orderedSelection = [regionId];
      } else {
        orderedSelection = buildSameLaneRangeSelection(
          sameLaneSelectedRegionIds,
          anchorRegionId,
          regionId,
          orderedLaneRegionIds
        );
      }
    } else {
      orderedSelection = [regionId];
    }

    applyRegionSelection(orderedSelection);
  }, [
    appendPrimarySelection,
    applyRegionSelection,
    buildSameLaneRangeSelection,
    findProjectRegionById,
    getGlobalRegionLaneType,
    getOrderedGlobalRegionIds,
    isAdditiveSelection,
    isGlobalRegionId,
    selectedRegionIds,
  ]);

  const handleRegionLassoSelection = useCallback((regionIds: string[], options: RegionClickOptions = DEFAULT_REGION_CLICK_OPTIONS) => {
    const orderedRegionIds = regionIds.filter(regionId => regions.some(region => region.id === regionId));
    const regularSelectedRegionIds = selectedRegionIds.filter(selectedId => !isGlobalRegionId(selectedId));
    const additiveSelection = isAdditiveSelection(options);
    const orderedSelection = additiveSelection
      ? orderedRegionIds.reduce<string[]>((nextSelection, regionId) => {
          if (nextSelection.includes(regionId)) {
            return nextSelection.filter(id => id !== regionId);
          }
          return appendPrimarySelection([...nextSelection, regionId], regionId);
        }, [...regularSelectedRegionIds])
      : orderedRegionIds;

    applyRegionSelection(orderedSelection);
  }, [appendPrimarySelection, applyRegionSelection, isAdditiveSelection, isGlobalRegionId, regions, selectedRegionIds]);

  const handleEmptyMainContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (preventEmptyMainContentDeselectRef.current) {
      preventEmptyMainContentDeselectRef.current = false;
      return;
    }

    handleRegionLassoSelection([], DEFAULT_REGION_CLICK_OPTIONS);
  }, [handleRegionLassoSelection]);

  const handleRegionLassoCommit = useCallback(() => {
    preventEmptyMainContentDeselectRef.current = true;
  }, []);

  useEffect(() => {
    const pendingRegionId = pendingAutoSelectionRegionIdRef.current;
    if (!pendingRegionId) {
      return;
    }

    const regionExists = regions.some(region => region.id === pendingRegionId);
    if (!regionExists) {
      return;
    }

    pendingAutoSelectionRegionIdRef.current = null;
    selectRegion(pendingRegionId, DEFAULT_REGION_CLICK_OPTIONS, regions);
  }, [regions, selectRegion]);

  const handleRegionCreated = useCallback((trackIndex: number, regionUI: RegionUI) => {
    const track = tracks[trackIndex];
    updateTrack(track);
    setSelectedTrack(track.getId().toString());

    pendingAutoSelectionRegionIdRef.current = regionUI.id;
    setRegions(previousRegions => [...previousRegions, regionUI]);
  }, [setSelectedTrack, tracks, updateTrack]);

  const handleExternalDropComplete = useCallback((trackIndex: number, regionUI: RegionUI) => {
    const track = tracks[trackIndex];
    if (!track) {
      return;
    }

    updateTrack(track);
    setSelectedTrack(track.getId().toString());

    const coreMaxBars = KGCore.instance().getCurrentProject().getMaxBars();
    if (coreMaxBars > maxBars) {
      useProjectStore.setState({ maxBars: coreMaxBars });
      document.documentElement.style.setProperty('--max-number-of-bars', coreMaxBars.toString());
    }

    pendingAutoSelectionRegionIdRef.current = regionUI.id;
    setRegions(previousRegions => [...previousRegions, regionUI]);
  }, [maxBars, setSelectedTrack, tracks, updateTrack]);

  const handleRegionUpdated = useCallback((
    regionId: string,
    updates: Partial<RegionUI>,
    expectedModelUpdates?: { startBeat: number; length: number }
  ) => {
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Updating region ${regionId} with:`, updates);
    }

    selectRegion(regionId);

    const updatedRegion = regions.find(region => region.id === regionId);
    if (updatedRegion) {
      const trackId = updates.trackId || updatedRegion.trackId;
      const track = tracks.find(candidate => candidate.getId().toString() === trackId);
      if (track) {
        setSelectedTrack(track.getId().toString());
      }
    }

    setRegions(previousRegions => previousRegions.map(region => (
      region.id === regionId ? { ...region, ...updates } : region
    )));

    const region = regions.find(candidate => candidate.id === regionId);
    if (!region) {
      return;
    }

    if (updates.trackId && updates.trackId !== region.trackId) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region ${regionId} moved from track ${region.trackId} to track ${updates.trackId}`);
      }

      const originalTrack = tracks.find(candidate => candidate.getId().toString() === region.trackId);
      const targetTrack = tracks.find(candidate => candidate.getId().toString() === updates.trackId);

      if (originalTrack && targetTrack) {
        setSelectedTrack(targetTrack.getId().toString());
        updateTrack(originalTrack);
        updateTrack(targetTrack);

        if (expectedModelUpdates) {
          const key = `${updates.trackId}-${regionId}-${Date.now()}`;
          pendingUpdates.current.set(key, {
            trackId: updates.trackId,
            regionId,
            startBeat: expectedModelUpdates.startBeat,
            length: expectedModelUpdates.length,
          });
        }
      }
    } else {
      const track = tracks.find(candidate => candidate.getId().toString() === region.trackId);
      if (track) {
        const trackRegions = track.getRegions();
        const midiRegion = trackRegions.find(candidate => candidate.getId() === regionId) as KGMidiRegion | undefined;

        if (midiRegion) {
          if (expectedModelUpdates) {
            if (DEBUG_MODE.MAIN_CONTENT) {
              console.log(`MainContent - Expected model updates: startBeat=${expectedModelUpdates.startBeat}, length=${expectedModelUpdates.length}`);
            }

            const key = `${track.getId()}-${regionId}-${Date.now()}`;
            pendingUpdates.current.set(key, {
              trackId: track.getId().toString(),
              regionId,
              startBeat: expectedModelUpdates.startBeat,
              length: expectedModelUpdates.length,
            });
          } else {
            const startBeat = midiRegion.getStartFromBeat();
            const length = midiRegion.getLength();

            if (DEBUG_MODE.MAIN_CONTENT) {
              console.log(`MainContent - Region before store update: startBeat=${startBeat}, length=${length}`);
            }

            const key = `${track.getId()}-${regionId}-${Date.now()}`;
            pendingUpdates.current.set(key, {
              trackId: track.getId().toString(),
              regionId,
              startBeat,
              length,
            });
          }
        }

        updateTrack(track);
      }
    }

    if (showPianoRoll && activeRegionId === regionId) {
      setActiveRegionId(regionId);

      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Updated region ${regionId} set as active region in piano roll`);
      }
    }
  }, [
    activeRegionId,
    regions,
    selectRegion,
    setActiveRegionId,
    setSelectedTrack,
    showPianoRoll,
    tracks,
    updateTrack,
  ]);

  const handleRegionClick = useCallback((regionId: string, options: RegionClickOptions = DEFAULT_REGION_CLICK_OPTIONS) => {
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Region clicked in MainContent (selection only): ${regionId}`);
    }

    selectRegion(regionId, options);

    const region = regions.find(candidate => candidate.id === regionId);
    if (!region) {
      return;
    }

    const track = tracks.find(candidate => candidate.getId().toString() === region.trackId);
    if (!track) {
      return;
    }

    setSelectedTrack(track.getId().toString());
  }, [regions, selectRegion, setSelectedTrack, tracks]);

  const handleOpenPianoRoll = useCallback((regionId: string) => {
    const project = KGCore.instance().getCurrentProject();
    for (const track of project.getTracks()) {
      const region = track.getRegions().find(candidate => candidate.getId() === regionId);
      if (region && region.getCurrentType() === 'KGAudioRegion') {
        return;
      }
    }

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Open piano roll via pencil for region: ${regionId}`);
    }

    handleRegionClick(regionId, DEFAULT_REGION_CLICK_OPTIONS);
    openMidiPianoRoll(regionId);
  }, [handleRegionClick, openMidiPianoRoll]);

  const handleOpenWaveform = useCallback((regionId: string) => {
    handleRegionClick(regionId, DEFAULT_REGION_CLICK_OPTIONS);
    openAudioWaveformViewer(regionId);
  }, [handleRegionClick, openAudioWaveformViewer]);

  const handleOpenSpectrogram = useCallback((regionId: string) => {
    handleRegionClick(regionId, DEFAULT_REGION_CLICK_OPTIONS);
    openSpectrogramViewer(regionId);
  }, [handleRegionClick, openSpectrogramViewer]);

  const handleOpenHybrid = useCallback((regionId: string) => {
    const targetRegion = findProjectRegionById(regionId);
    if (pianoRollMode === 'midi-edit' && activeRegionId && targetRegion instanceof KGAudioRegion) {
      openHybridMode(activeRegionId, regionId);
    } else if (pianoRollMode === 'midi-edit' && activeRegionId && targetRegion instanceof KGMidiRegion) {
      openMidiReferenceMode(activeRegionId, regionId);
    } else if ((pianoRollMode === 'audio-waveform' || pianoRollMode === 'spectrogram') && activeRegionId) {
      openHybridMode(regionId, activeRegionId);
    } else if (pianoRollMode === 'midi-reference' && activeRegionId && targetRegion instanceof KGMidiRegion) {
      openMidiReferenceMode(activeRegionId, regionId);
    }
  }, [activeRegionId, findProjectRegionById, openHybridMode, openMidiReferenceMode, pianoRollMode]);

  return {
    regions,
    deleteSelectedRegions,
    selection: {
      selectedRegionId,
      findProjectRegionById,
      isGlobalRegionId,
      selectGlobalRegion,
    },
    handleRegionCreated,
    handleExternalDropComplete,
    handleRegionUpdated,
    handleRegionClick,
    handleRegionLassoSelection,
    handleRegionLassoCommit,
    handleEmptyMainContentClick,
    handleOpenPianoRoll,
    handleOpenWaveform,
    handleOpenSpectrogram,
    handleOpenHybrid,
  };
}
