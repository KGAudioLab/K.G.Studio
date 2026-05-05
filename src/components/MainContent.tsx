import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import './MainContent.css';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGTrack } from '../core/track/KGTrack';
import { KGRegion } from '../core/region/KGRegion';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import TrackInfoPanel from './track/TrackInfoPanel';
import TrackGridPanel from './track/TrackGridPanel';
import PianoRoll from './piano-roll/PianoRoll';
import type { RegionClickOptions, RegionUI } from './interfaces';
import { DEBUG_MODE, BAR_NUMBERS_CONSTANTS, TOOLBAR_CONSTANTS } from '../constants';
import { useRegionOperations } from '../hooks/useRegionOperations';
import { regionDeleteManager } from '../util/regionDeleteUtil';
import { KGMainContentState } from '../core/state/KGMainContentState';
import { ChangeLoopSettingsCommand } from '../core/commands';

interface MainContentProps {
  onTrackClick?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  onTrackClick = () => { } // Default to empty function if not provided
}) => {
  const {
    tracks,
    maxBars,
    barWidthMultiplier,
    reorderTracks,
    updateTrack,
    updateTrackProperties,
    timeSignature,
    setPlayheadPosition,
    playheadPosition,
    isPlaying,
    autoScrollEnabled,
    setAutoScrollEnabled,
    clearAllSelections,
    setSelectedTrack,
    selectedRegionIds,
    showPianoRoll,
    activeRegionId,
    setShowPianoRoll,
    setActiveRegionId,
    pianoRollMode,
    openMidiPianoRoll,
    openSpectrogramViewer,
    openHybridMode,
    hybridAudioRegionId,
    addTrack,
    addAudioTrack,
    projectName,
    savedProjectName,
    requestPianoRollScroll,
    mainContentScrollRequest,
  } = useProjectStore();

  // State to store regions
  const [regions, setRegions] = useState<RegionUI[]>([]);

  // Drag state for track grid highlighting
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);

  // Piano roll state is now managed by the store - removed local state

  // Region selection state
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  // Use the region operations hook
  const { deleteSelectedRegions } = useRegionOperations({
    tracks,
    updateTrack,
    setRegions,
    selectedRegionId,
    setSelectedRegionId,
    showPianoRoll,
    setShowPianoRoll,
    activeRegionId,
    setActiveRegionId
  });

  // Register the delete function with the global manager
  useEffect(() => {
    regionDeleteManager.registerDeleteCallback(deleteSelectedRegions);

    // Cleanup on unmount
    return () => {
      regionDeleteManager.unregisterDeleteCallback();
    };
  }, [deleteSelectedRegions]);

  // Refs to track pending updates for verification
  const pendingUpdates = useRef<Map<string, { trackId: string, regionId: string, startBeat: number, length: number }>>(new Map());
  const preventEmptyMainContentDeselectRef = useRef(false);
  const pendingAutoSelectionRegionIdRef = useRef<string | null>(null);

  // Refs for auto-scroll during playback
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const expectedScrollLeftRef = useRef<number>(-1);
  const isPlayingRef = useRef(false);
  const previousBarWidthMultiplierRef = useRef(barWidthMultiplier);

  // Refs for bar numbers and loop range drag functionality
  const barNumbersRef = useRef<HTMLDivElement | null>(null);
  const isLoopDraggingRef = useRef(false);
  const loopDragStartBarRef = useRef<number | null>(null);
  const loopDragStartXRef = useRef<number | null>(null);
  const loopDragOriginalSettingsRef = useRef<{ isLooping: boolean; loopingRange: [number, number] } | null>(null);

  // Sync isPlayingRef for use inside scroll event closure
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useLayoutEffect(() => {
    const previousMultiplier = previousBarWidthMultiplierRef.current;
    if (previousMultiplier === barWidthMultiplier) return;

    previousBarWidthMultiplierRef.current = barWidthMultiplier;

    const container = mainContentRef.current;
    if (!container) return;

    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width')
    ) || 200;
    const visibleMusicWidth = Math.max(0, container.clientWidth - infoWidth);
    const previousBarWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * previousMultiplier;
    const nextBarWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;

    if (visibleMusicWidth === 0 || previousBarWidth === 0 || nextBarWidth === 0) return;

    const centerPixelBeforeZoom = container.scrollLeft + visibleMusicWidth / 2;
    const anchorBeat = (centerPixelBeforeZoom / previousBarWidth) * timeSignature.numerator;
    const targetPixel = (anchorBeat / timeSignature.numerator) * nextBarWidth;
    const targetScrollLeft = targetPixel - visibleMusicWidth / 2;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
    );

    expectedScrollLeftRef.current = clampedScrollLeft;
    container.scrollLeft = clampedScrollLeft;
  }, [barWidthMultiplier, timeSignature]);

  // Detect manual horizontal scroll during playback
  useEffect(() => {
    const container = mainContentRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (!isPlayingRef.current) return;
      if (Math.abs(container.scrollLeft - expectedScrollLeftRef.current) < 1) return;
      useProjectStore.getState().setAutoScrollEnabled(false);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to keep playhead centered during playback
  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled) return;

    const container = mainContentRef.current;
    if (!container) return;

    const beatsPerBar = timeSignature.numerator;
    const barPosition = playheadPosition / beatsPerBar;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
    ) || 40;
    const playheadPixel = barPosition * barWidth;

    // Center the playhead in the visible grid area (excluding the sticky info panel)
    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width')
    ) || 200;
    const targetScrollLeft = playheadPixel - (container.clientWidth - infoWidth) / 2;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
    );

    expectedScrollLeftRef.current = clampedScrollLeft;
    container.scrollLeft = clampedScrollLeft;
  }, [playheadPosition, isPlaying, autoScrollEnabled, timeSignature]);

  // Handle scroll requests from piano roll header clicks
  useEffect(() => {
    if (mainContentScrollRequest === null) return;

    const container = mainContentRef.current;
    if (!container) return;

    const beatsPerBar = timeSignature.numerator;
    const barPosition = mainContentScrollRequest / beatsPerBar;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
    ) || 40;
    const playheadPixel = barPosition * barWidth;

    // Center the playhead in the visible grid area (excluding the sticky info panel)
    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width')
    ) || 200;
    const targetScrollLeft = playheadPixel - (container.clientWidth - infoWidth) / 2;
    const clampedScrollLeft = Math.max(
      0,
      Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth)
    );

    container.scrollLeft = clampedScrollLeft;

    // Clear the request after handling
    useProjectStore.setState({ mainContentScrollRequest: null });
  }, [mainContentScrollRequest, timeSignature]);

  // Effect to verify track updates
  useEffect(() => {
    // Check for pending updates
    if (pendingUpdates.current.size > 0) {
      // Create a copy of the pending updates
      const updates = new Map(pendingUpdates.current);

      // Clear pending updates
      pendingUpdates.current.clear();

      // Check each update
      updates.forEach((update, key) => {
        const { trackId, regionId, startBeat, length } = update;

        // Find the track
        const track = tracks.find(t => t.getId().toString() === trackId);
        if (track) {
          // Find the region
          const regions = track.getRegions();
          const region = regions.find(r => r.getId() === regionId);

          if (region && DEBUG_MODE.MAIN_CONTENT) {
            console.log(`Verification - Region ${regionId} in track ${trackId}:`);
            console.log(`  Expected: startBeat=${startBeat}, length=${length}`);
            console.log(`  Actual: startBeat=${region.getStartFromBeat()}, length=${region.getLength()}, trackId=${region.getTrackId()}, trackIndex=${region.getTrackIndex()}`);

            // Check if the update was successful
            const success = region.getStartFromBeat() === startBeat && region.getLength() === length && region.getTrackId() === trackId;
            console.log(`  Update successful: ${success}`);
          }
        }
      });
    }
  }, [tracks]);

  // Effect to update regions when tracks change
  useEffect(() => {
    // Create a new array of RegionUI objects based on the current tracks
    const updatedRegions: RegionUI[] = [];

    // Iterate through all tracks
    tracks.forEach(track => {
      const trackId = track.getId().toString();
      const trackIndex = track.getTrackIndex();

      // Iterate through all regions in the track
      track.getRegions().forEach(region => {
        if (region instanceof KGMidiRegion || region instanceof KGAudioRegion) {
          // Calculate bar number and length from beats
          const beatsPerBar = timeSignature.numerator;
          const barNumber = (region.getStartFromBeat() / beatsPerBar) + 1;
          const length = region.getLength() / beatsPerBar;

          // Create a RegionUI object
          updatedRegions.push({
            id: region.getId(),
            trackId,
            trackIndex,
            barNumber,
            length,
            name: region.getName()
          });
        }
      });
    });

    // Update the regions state
    setRegions(updatedRegions);
  }, [tracks, timeSignature]);

  // Apply auto-selection for newly created/imported regions after the regions state commits.
  useEffect(() => {
    const pendingRegionId = pendingAutoSelectionRegionIdRef.current;
    if (!pendingRegionId) return;

    const regionExists = regions.some(region => region.id === pendingRegionId);
    if (!regionExists) return;

    pendingAutoSelectionRegionIdRef.current = null;
    selectRegion(pendingRegionId, { shiftKey: false }, regions);
  }, [regions]);

  // Handle track name edit
  const handleTrackNameEdit = (track: KGTrack, newName: string) => {
    // Use the command pattern to update track name with undo support
    updateTrackProperties(track.getId(), { name: newName });
  };

  // Handle track reordering
  const handleTracksReordered = (fromIndex: number, toIndex: number) => {
    // Reorder tracks in the store - this will also update trackIndex in each KGTrack
    reorderTracks(fromIndex, toIndex);

    // Update regions to match the new track order
    setRegions(prevRegions => {
      return prevRegions.map(region => {
        // If the region belongs to the dragged track, update its trackIndex
        if (region.trackIndex === fromIndex) {
          return { ...region, trackIndex: toIndex };
        }
        // If the region belongs to a track that was shifted due to the drag operation
        else if (
          (fromIndex < toIndex &&
            region.trackIndex > fromIndex &&
            region.trackIndex <= toIndex)
        ) {
          // Shift up by 1
          return { ...region, trackIndex: region.trackIndex - 1 };
        }
        else if (
          (fromIndex > toIndex &&
            region.trackIndex < fromIndex &&
            region.trackIndex >= toIndex)
        ) {
          // Shift down by 1
          return { ...region, trackIndex: region.trackIndex + 1 };
        }
        // Otherwise leave it unchanged
        return region;
      });
    });

    // Update the grid drag state to match
    setDraggedTrackIndex(null);
    setDragOverTrackIndex(null);
  };

  // Handle region creation from TrackGridPanel
  const handleRegionCreated = (trackIndex: number, regionUI: RegionUI, midiRegion: KGMidiRegion) => {
    // Note: The region model is already created by the CreateRegionCommand
    // We just need to update the UI state and handle selection

    // Get the track for store updates
    const track = tracks[trackIndex];

    // Update the track in the store to reflect the command changes
    updateTrack(track);

    // Select the track that contains the new region
    setSelectedTrack(track.getId().toString());

    pendingAutoSelectionRegionIdRef.current = regionUI.id;
    setRegions(prevRegions => [...prevRegions, regionUI]);
  };

  // Handle regions dropped from K.G.One panel (external drag-and-drop)
  const handleExternalDropComplete = (trackIndex: number, regionUI: RegionUI) => {
    const track = tracks[trackIndex];
    if (!track) return;
    updateTrack(track);
    setSelectedTrack(track.getId().toString());

    // Sync maxBars from core model — ImportAudioCommand may have expanded it
    const coreMaxBars = KGCore.instance().getCurrentProject().getMaxBars();
    if (coreMaxBars > maxBars) {
      useProjectStore.setState({ maxBars: coreMaxBars });
      document.documentElement.style.setProperty('--max-number-of-bars', coreMaxBars.toString());
    }

    pendingAutoSelectionRegionIdRef.current = regionUI.id;
    setRegions(prev => [...prev, regionUI]);
  };

  // Handle region updates (resize, move, etc.)
  const handleRegionUpdated = (
    regionId: string,
    updates: Partial<RegionUI>,
    expectedModelUpdates?: { startBeat: number, length: number }
  ) => {
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Updating region ${regionId} with:`, updates);
    }

    // Select the region when it's being updated (resize or move)
    selectRegion(regionId);

    // Find the region to determine which track to select
    const updatedRegion = regions.find(r => r.id === regionId);
    if (updatedRegion) {
      // Use the updated trackId if available, otherwise use the existing trackId
      const trackId = updates.trackId || updatedRegion.trackId;
      const track = tracks.find(t => t.getId().toString() === trackId);
      if (track) {
        setSelectedTrack(track.getId().toString());
      }
    }

    // Update the region in the UI state
    setRegions(prevRegions => {
      return prevRegions.map(region => {
        if (region.id === regionId) {
          return { ...region, ...updates };
        }
        return region;
      });
    });

    // Find the region that was updated
    const region = regions.find(r => r.id === regionId);
    if (!region) return;

    // Check if the track ID is being updated (region moved to different track)
    if (updates.trackId && updates.trackId !== region.trackId) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region ${regionId} moved from track ${region.trackId} to track ${updates.trackId}`);
      }

      // Get the original track
      const originalTrack = tracks.find(t => t.getId().toString() === region.trackId);

      // Get the target track
      const targetTrack = tracks.find(t => t.getId().toString() === updates.trackId);

      if (originalTrack && targetTrack) {
        // Select the target track that now contains the region
        setSelectedTrack(targetTrack.getId().toString());

        // Update both tracks in the store
        updateTrack(originalTrack);
        updateTrack(targetTrack);

        // Add to pending updates for verification
        if (expectedModelUpdates) {
          const key = `${updates.trackId}-${regionId}-${Date.now()}`;
          pendingUpdates.current.set(key, {
            trackId: updates.trackId,
            regionId,
            startBeat: expectedModelUpdates.startBeat,
            length: expectedModelUpdates.length
          });
        }
      }
    } else {
      // Find the track that contains this region
      const track = tracks.find(t => t.getId().toString() === region.trackId);
      if (track) {
        // Log the track's regions before updating the store
        const trackRegions = track.getRegions();
        const midiRegion = trackRegions.find(r => r.getId() === regionId) as KGMidiRegion | undefined;

        if (midiRegion) {
          // If we have expected model updates, use those
          if (expectedModelUpdates) {
            if (DEBUG_MODE.MAIN_CONTENT) {
              console.log(`MainContent - Expected model updates: startBeat=${expectedModelUpdates.startBeat}, length=${expectedModelUpdates.length}`);
            }

            // Add to pending updates for verification
            const key = `${track.getId()}-${regionId}-${Date.now()}`;
            pendingUpdates.current.set(key, {
              trackId: track.getId().toString(),
              regionId,
              startBeat: expectedModelUpdates.startBeat,
              length: expectedModelUpdates.length
            });
          } else {
            // Otherwise use the current values (for backward compatibility)
            const startBeat = midiRegion.getStartFromBeat();
            const length = midiRegion.getLength();

            if (DEBUG_MODE.MAIN_CONTENT) {
              console.log(`MainContent - Region before store update: startBeat=${startBeat}, length=${length}`);
            }

            // Add to pending updates for verification
            const key = `${track.getId()}-${regionId}-${Date.now()}`;
            pendingUpdates.current.set(key, {
              trackId: track.getId().toString(),
              regionId,
              startBeat,
              length
            });
          }
        }

        // Update the track in the store to persist changes
        updateTrack(track);
      }
    }

    // Keep the active piano roll region in sync when that same region is updated.
    // Do not switch the editor to an unrelated region from generic move/resize updates.
    if (showPianoRoll && activeRegionId === regionId) {
      setActiveRegionId(regionId);

      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Updated region ${regionId} set as active region in piano roll`);
      }
    }
  };

  // Helper function to select a region (clears previous selections)
  const applyRegionSelection = (orderedSelectionIds: string[]) => {
    const core = KGCore.instance();

    tracks.forEach(projectTrack => {
      projectTrack.getRegions().forEach(projectRegion => projectRegion.deselect());
    });

    clearAllSelections();

    const selectedRegions: KGRegion[] = orderedSelectionIds
      .map(selectedId => {
        for (const projectTrack of tracks) {
          const selectedRegion = projectTrack.getRegions().find(r => r.getId() === selectedId);
          if (selectedRegion) {
            selectedRegion.select();
            return selectedRegion as KGRegion;
          }
        }
        return null;
      })
      .filter((selectedRegion): selectedRegion is KGRegion => selectedRegion !== null);

    if (selectedRegions.length > 0) {
      core.addSelectedItems(selectedRegions);
    }

    const lastSelectedRegionId = selectedRegions.length > 0
      ? selectedRegions[selectedRegions.length - 1].getId()
      : null;

    setSelectedRegionId(lastSelectedRegionId);

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Selected regions: ${selectedRegions.map(selectedRegion => selectedRegion.getId()).join(', ')}`);
    }

    if (!showPianoRoll) {
      return;
    }

    if (!lastSelectedRegionId) {
      setShowPianoRoll(false);
      setActiveRegionId(null);
      return;
    }

    const lastSelectedRegion = selectedRegions[selectedRegions.length - 1];
    if (lastSelectedRegion instanceof KGAudioRegion) {
      openSpectrogramViewer(lastSelectedRegionId);
    } else if (lastSelectedRegion instanceof KGMidiRegion) {
      openMidiPianoRoll(lastSelectedRegionId);
    }
  };

  const selectRegion = (
    regionId: string,
    options: RegionClickOptions = { shiftKey: false },
    regionsToSearch?: RegionUI[]
  ) => {
    const regionsToUse = regionsToSearch || regions;
    const region = regionsToUse.find(r => r.id === regionId);
    if (!region) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region not found in UI state: ${regionId}`);
      }
      return;
    }

    const track = tracks.find(t => t.getId().toString() === region.trackId);
    if (!track) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Track not found for region: ${regionId}`);
      }
      return;
    }

    const coreRegion = track.getRegions().find(r => r.getId() === regionId);
    if (!coreRegion) {
      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Region not found in track model: ${regionId}`);
      }
      return;
    }

    const orderedSelection = options.shiftKey
      ? (selectedRegionIds.includes(regionId)
        ? selectedRegionIds.filter(id => id !== regionId)
        : [...selectedRegionIds, regionId])
      : [regionId];

    applyRegionSelection(orderedSelection);
  };

  const handleRegionLassoSelection = (regionIds: string[], options: RegionClickOptions = { shiftKey: false }) => {
    const orderedRegionIds = regionIds.filter(regionId => regions.some(region => region.id === regionId));
    const orderedSelection = options.shiftKey
      ? orderedRegionIds.reduce<string[]>((nextSelection, regionId) => {
          if (nextSelection.includes(regionId)) {
            return nextSelection.filter(id => id !== regionId);
          }
          return [...nextSelection, regionId];
        }, [...selectedRegionIds])
      : orderedRegionIds;

    applyRegionSelection(orderedSelection);
  };

  const handleEmptyMainContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      return;
    }

    if (preventEmptyMainContentDeselectRef.current) {
      preventEmptyMainContentDeselectRef.current = false;
      return;
    }

    handleRegionLassoSelection([], { shiftKey: false });
  };

  const handleRegionLassoCommit = () => {
    preventEmptyMainContentDeselectRef.current = true;
  };

  // Handle region single click: selection only (no piano roll opening)
  const handleRegionClick = (regionId: string, options: RegionClickOptions = { shiftKey: false }) => {
    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Region clicked in MainContent (selection only): ${regionId}`);
    }

    // Select the region
    selectRegion(regionId, options);

    // Also select the containing track
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    const track = tracks.find(t => t.getId().toString() === region.trackId);
    if (!track) return;
    setSelectedTrack(track.getId().toString());

  };

  // Handle explicit pencil action: select region and open piano roll
  const handleOpenPianoRoll = (regionId: string) => {
    // Don't open piano roll for audio regions
    const project = KGCore.instance().getCurrentProject();
    for (const track of project.getTracks()) {
      const region = track.getRegions().find(r => r.getId() === regionId);
      if (region && region.getCurrentType() === 'KGAudioRegion') {
        return;
      }
    }

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Open piano roll via pencil for region: ${regionId}`);
    }

    // Reuse selection logic
    handleRegionClick(regionId, { shiftKey: false });

    // Activate and show piano roll in midi-edit mode
    openMidiPianoRoll(regionId);
  };

  // Handle spectrogram viewer open
  const handleOpenSpectrogram = (regionId: string) => {
    handleRegionClick(regionId, { shiftKey: false });
    openSpectrogramViewer(regionId);
  };

  // Handle hybrid mode open (+ button clicked on opposite-type region)
  const handleOpenHybrid = (regionId: string) => {
    if (pianoRollMode === 'midi-edit' && activeRegionId) {
      openHybridMode(activeRegionId, regionId);
    } else if (pianoRollMode === 'spectrogram' && activeRegionId) {
      openHybridMode(regionId, activeRegionId);
    }
  };

  // + button is visible only when piano roll is open and mode is not hybrid
  const showHybridButtonForAudio = showPianoRoll && pianoRollMode === 'midi-edit';
  const showHybridButtonForMidi  = showPianoRoll && pianoRollMode === 'spectrogram';

  // Handle piano roll close
  const handlePianoRollClose = () => {
    setShowPianoRoll(false);
    setActiveRegionId(null);
  };

  /**
   * Add keyboard event listener for region deletion
   * Handles Backspace (Windows) and Delete (Mac) keys to delete selected regions
   * Only processes deletion when not in the piano roll (piano roll has its own delete handler)
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if user is typing in an input field (including ChatBox)
      const target = event.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

      // Handle delete key for selected regions (Backspace on Windows, Delete on Mac)
      if (event.key === 'Backspace' || event.key === 'Delete') {
        // Only handle if we're not in the piano roll (piano roll has its own delete handler)
        const isInPianoRoll = document.querySelector('.piano-roll')?.contains(event.target as Node);
        const isPianoRollOpen = showPianoRoll;

        if (!isInPianoRoll && !isPianoRollOpen) {
          const deleted = deleteSelectedRegions();
          if (deleted) {
            // Prevent default behavior only if regions were actually deleted
            event.preventDefault();
          }
        }
      }
    };

    // Add event listener
    window.addEventListener('keydown', handleKeyDown);

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [deleteSelectedRegions, showPianoRoll]); // Dependencies for the effect

  // Utility function to calculate playhead position from mouse coordinates (bar-level snapping)
  const calculatePlayheadFromMouse = useCallback((clientX: number): number | null => {
    if (!barNumbersRef.current) return null;

    const rect = barNumbersRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;

    // Calculate the width of each bar
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
    ) || 40;

    // Find the closest bar start; honor snapping toggle
    const snap = KGMainContentState.instance().isSnappingEnabled();
    const barIndex = snap ? Math.round(relativeX / barWidth) : relativeX / barWidth;

    // Ensure we don't go below 0
    const clampedBarIndex = Math.max(0, barIndex);

    // Calculate destination beat position (start of the bar)
    const beatsPerBar = timeSignature.numerator;
    const destinationBeatPosition = clampedBarIndex * beatsPerBar;

    return destinationBeatPosition;
  }, [timeSignature]);

  // Utility function to calculate bar index from mouse coordinates (for loop range selection)
  const calculateBarIndexFromMouse = useCallback((clientX: number): number | null => {
    if (!barNumbersRef.current) return null;

    const rect = barNumbersRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;

    // Calculate the width of each bar
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
    ) || 40;

    // Calculate bar index (using Math.floor for exact bar boundaries)
    const barIndex = Math.floor(relativeX / barWidth);

    // Clamp to valid range [0, maxBars - 1]
    return Math.max(0, Math.min(barIndex, maxBars - 1));
  }, [maxBars]);

  // Handle mouse down to start dragging (for loop range selection)
  const handleBarNumbersMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle left mouse button
    if (e.button !== 0) return;

    // Calculate starting bar index
    const startBarIndex = calculateBarIndexFromMouse(e.clientX);
    if (startBarIndex === null) return;

    // Always start loop drag tracking
    isLoopDraggingRef.current = true;
    loopDragStartBarRef.current = startBarIndex;
    loopDragStartXRef.current = e.clientX;

    // Capture original loop settings for undo/redo
    loopDragOriginalSettingsRef.current = {
      isLooping,
      loopingRange: [...loopingRange] as [number, number]
    };

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Bar numbers mouse down - Start bar: ${startBarIndex} (displayed as bar ${startBarIndex + 1})`);
    }

    // Prevent text selection during drag
    e.preventDefault();
  };

  // Global mouse move and mouse up handlers for loop range drag functionality
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isLoopDraggingRef.current) return;
      if (loopDragStartBarRef.current === null || loopDragStartXRef.current === null) return;

      // Calculate distance moved
      const distanceMoved = Math.abs(e.clientX - loopDragStartXRef.current);

      // Only update if moved beyond threshold
      if (distanceMoved < BAR_NUMBERS_CONSTANTS.DRAG_THRESHOLD) return;

      // Calculate current bar index
      const currentBarIndex = calculateBarIndexFromMouse(e.clientX);
      if (currentBarIndex === null) return;

      // Create loop range [min, max] regardless of drag direction
      const startBar = loopDragStartBarRef.current;
      const loopStart = Math.min(startBar, currentBarIndex);
      const loopEnd = Math.max(startBar, currentBarIndex);
      const newLoopRange: [number, number] = [loopStart, loopEnd];

      // Update project model
      const core = KGCore.instance();
      const project = core.getCurrentProject();
      project.setLoopingRange(newLoopRange);
      project.setIsLooping(true); // Enable looping immediately during drag for real-time visual feedback

      // Update store to trigger UI re-render
      useProjectStore.setState({ loopingRange: newLoopRange, isLooping: true });

      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Loop range drag - Range: [${loopStart}, ${loopEnd}] (bars ${loopStart + 1}-${loopEnd + 1})`);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isLoopDraggingRef.current) {
        if (loopDragStartXRef.current !== null) {
          const distanceMoved = Math.abs(e.clientX - loopDragStartXRef.current);

          // If dragged beyond threshold, execute command for undo/redo support
          if (distanceMoved >= BAR_NUMBERS_CONSTANTS.DRAG_THRESHOLD) {
            const core = KGCore.instance();
            const currentIsLooping = core.getCurrentProject().getIsLooping();
            const currentLoopingRange = core.getCurrentProject().getLoopingRange();

            // Only execute command if settings actually changed from original
            if (loopDragOriginalSettingsRef.current) {
              const originalSettings = loopDragOriginalSettingsRef.current;
              const settingsChanged =
                originalSettings.isLooping !== currentIsLooping ||
                originalSettings.loopingRange[0] !== currentLoopingRange[0] ||
                originalSettings.loopingRange[1] !== currentLoopingRange[1];

              if (settingsChanged) {
                // Stop playback if currently playing (get fresh state from store)
                const { isPlaying: currentIsPlaying, stopPlaying: currentStopPlaying } = useProjectStore.getState();
                if (currentIsPlaying) {
                  currentStopPlaying();
                }

                // Revert to original state first (since we updated in real-time)
                core.getCurrentProject().setIsLooping(originalSettings.isLooping);
                core.getCurrentProject().setLoopingRange(originalSettings.loopingRange);

                // Now execute command to apply new settings with undo support
                const command = new ChangeLoopSettingsCommand({
                  isLooping: currentIsLooping,
                  loopingRange: currentLoopingRange
                });
                core.executeCommand(command);

                if (DEBUG_MODE.MAIN_CONTENT) {
                  console.log('Loop range drag ended - Command executed for undo/redo');
                }
              }
            }
          } else {
            // Single click (moved < threshold) - set playhead position
            const clickPosition = calculatePlayheadFromMouse(e.clientX);
            if (clickPosition !== null) {
              setPlayheadPosition(clickPosition);
              requestPianoRollScroll(clickPosition);

              if (DEBUG_MODE.MAIN_CONTENT) {
                console.log(`Single click on bar numbers - Set playhead to: ${clickPosition}`);
              }
            }
          }
        }

        // Reset drag state
        isLoopDraggingRef.current = false;
        loopDragStartBarRef.current = null;
        loopDragStartXRef.current = null;
        loopDragOriginalSettingsRef.current = null;
      }
    };

    // Add global event listeners for drag functionality
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Cleanup event listeners on unmount
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [calculateBarIndexFromMouse, calculatePlayheadFromMouse, setPlayheadPosition, requestPianoRollScroll]);

  const { showInstrumentSelection, isLooping, loopingRange } = useProjectStore();

  // Helper function to check if a bar (0-indexed) is in the loop range
  const isBarInLoopRange = (barIndex: number): boolean => {
    if (!isLooping) return false;
    // Loop range is [startBar, endBar] (0-indexed)
    // We want to highlight bars from startBar to endBar inclusive
    return barIndex >= loopingRange[0] && barIndex <= loopingRange[1];
  };

  return (
    <div
      className={`main-content${showInstrumentSelection ? ' has-left-instrument' : ''}`}
      ref={mainContentRef}
      onClick={handleEmptyMainContentClick}
    >
      <div className="main-content-wrapper" onClick={handleEmptyMainContentClick}>
        {/* Top-left spacer */}
        <div className="top-left-spacer">
          <button className="add-track-btn" onClick={() => addTrack()}>+ MIDI</button>
          <button className="add-track-btn" onClick={() => addAudioTrack()}>+ Audio</button>
        </div>

        {/* Bar numbers at the top */}
        <div
          className="bar-numbers"
          ref={barNumbersRef}
          onMouseDown={handleBarNumbersMouseDown}
        >
          {Array.from({ length: maxBars }, (_, i) => (
            <div
              key={i}
              className={`bar-number-cell${isBarInLoopRange(i) ? ' looped' : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        <div className="main-content-body" onClick={handleEmptyMainContentClick}>
          {/* Fixed left panel with track info */}
          <TrackInfoPanel
            tracks={tracks}
            onTrackClick={onTrackClick}
            onTrackNameEdit={handleTrackNameEdit}
            onTracksReordered={handleTracksReordered}
          />

          {/* Scrollable grid area */}
          <TrackGridPanel
            tracks={tracks}
            regions={regions}
            maxBars={maxBars}
            timeSignature={timeSignature}
            draggedTrackIndex={draggedTrackIndex}
            dragOverTrackIndex={dragOverTrackIndex}
            selectedRegionId={selectedRegionId}
            projectName={projectName}
            onRegionCreated={handleRegionCreated}
            onRegionUpdated={handleRegionUpdated}
            onRegionClick={handleRegionClick}
            onRegionLassoSelection={handleRegionLassoSelection}
            onRegionLassoCommit={handleRegionLassoCommit}
            onOpenPianoRoll={handleOpenPianoRoll}
            onOpenSpectrogram={handleOpenSpectrogram}
            showHybridButtonForAudio={showHybridButtonForAudio}
            showHybridButtonForMidi={showHybridButtonForMidi}
            onOpenHybrid={handleOpenHybrid}
            onExternalDropComplete={handleExternalDropComplete}
          />
        </div>
      </div>

      {/* Piano Roll / Spectrogram Viewer - render using portal */}
      {showPianoRoll && createPortal(
        <PianoRoll
          onClose={handlePianoRollClose}
          regionId={activeRegionId}
          mode={pianoRollMode}
          audioRegion={(() => {
            // spectrogram mode: audio region IS the activeRegionId
            // hybrid mode: audio region is hybridAudioRegionId
            const audioId = pianoRollMode === 'spectrogram' ? activeRegionId
                          : pianoRollMode === 'hybrid'      ? hybridAudioRegionId
                          : null;
            if (!audioId) return undefined;
            for (const track of tracks) {
              const region = track.getRegions().find(r => r.getId() === audioId);
              if (region && region.getCurrentType() === 'KGAudioRegion') {
                return region as unknown as KGAudioRegion;
              }
            }
            return undefined;
          })()}
          trackId={(() => {
            const audioId = pianoRollMode === 'spectrogram' ? activeRegionId
                          : pianoRollMode === 'hybrid'      ? hybridAudioRegionId
                          : null;
            if (!audioId) return undefined;
            for (const track of tracks) {
              if (track.getRegions().some(r => r.getId() === audioId)) {
                return track.getId().toString();
              }
            }
            return undefined;
          })()}
          projectName={savedProjectName}
        />,
        document.body
      )}
    </div>
  );
};

export default MainContent; 
