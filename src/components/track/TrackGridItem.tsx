import React, { useEffect, useState, useRef } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import RegionItem from './RegionItem';
import TrackAutomationLane from './TrackAutomationLane';
import type { RegionClickOptions, RegionPreviewContentStyle, RegionUI, ResizeAction } from '../interfaces';
import { REGION_CONSTANTS, DEBUG_MODE } from '../../constants';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { useProjectStore } from '../../stores/projectStore';
import { isModifierKeyPressed } from '../../util/osUtil';
import { CHORD_REGION_IMPORT_MIME_TYPE } from '../../util/chordRegionImportUtil';

interface RegionResizePreviewBaseline {
  regionId: string;
  originalBarNumber: number;
  originalLength: number;
  originalLeft: number;
  originalWidth: number;
  originalContentWidth: number;
}

interface RegionDragPreviewBaseline {
  regionId: string;
  originalBarNumber: number;
  originalTrackIndex: number;
  originalLeft: number;
  originalWidth: number;
}

interface TrackGridItemProps {
  track: KGTrack;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  regions: RegionUI[];
  maxBars: number;
  selectedRegionId: string | null;
  gridContainerRef: React.RefObject<HTMLDivElement | null>;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>, index: number) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>, index: number) => void;
  onRegionResize?: (regionId: string, newBarNumber: number, newLength: number) => void;
  onRegionResizeEnd?: (regionId: string, finalBarNumber: number, finalLength: number) => void;
  onRegionDrag?: (regionId: string, newBarNumber: number, newTrackIndex: number) => void;
  onRegionDragEnd?: (regionId: string, finalBarNumber: number, finalTrackIndex: number) => void;
  onRegionFineMoveEnd?: (regionId: string, deltaInBars: number) => void;
  onRegionClick?: (regionId: string, options: RegionClickOptions) => void;
  onOpenPianoRoll?: (regionId: string) => void;
  onOpenWaveform?: (regionId: string) => void;
  onOpenSpectrogram?: (regionId: string) => void;
  showHybridButtonForAudio?: boolean;
  showHybridButtonForMidi?: boolean;
  onOpenHybrid?: (regionId: string) => void;
  allTracks?: KGTrack[]; // Added to access all tracks for drag operations
  onKGOneClipDrop?: (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => void;
  onChordRegionDrop?: (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => void;
  previewRegionStyles?: Record<string, React.CSSProperties>;
  setPreviewRegionStyles?: React.Dispatch<React.SetStateAction<Record<string, React.CSSProperties>>>;
  previewRegionContentStyles?: Record<string, RegionPreviewContentStyle>;
  setPreviewRegionContentStyles?: React.Dispatch<React.SetStateAction<Record<string, RegionPreviewContentStyle>>>;
}

const TrackGridItem: React.FC<TrackGridItemProps> = ({
  track,
  index,
  isDragging,
  isDragOver,
  regions,
  maxBars,
  selectedRegionId,
  gridContainerRef,
  onDoubleClick,
  onClick,
  onRegionResize,
  onRegionResizeEnd,
  onRegionDrag,
  onRegionDragEnd,
  onRegionFineMoveEnd,
  onRegionClick,
  onOpenPianoRoll,
  onOpenWaveform,
  onOpenSpectrogram,
  showHybridButtonForAudio,
  showHybridButtonForMidi,
  onOpenHybrid,
  allTracks,
  onKGOneClipDrop,
  onChordRegionDrop,
  previewRegionStyles,
  setPreviewRegionStyles,
  previewRegionContentStyles,
  setPreviewRegionContentStyles,
}) => {
  const selectedRegionIds = useProjectStore(state => state.selectedRegionIds);
  const activeTrackAutomationTrackId = useProjectStore(state => state.activeTrackAutomationTrackId);
  const activeTrackAutomationType = useProjectStore(state => state.activeTrackAutomationType);
  const trackAutomationRedrawVersion = useProjectStore(state => state.trackAutomationRedrawVersion);
  const audioWaveformRedrawVersion = useProjectStore(state => state.audioWaveformRedrawVersion);
  const recordingMode = useProjectStore(state => state.recordingMode);
  const recordingTargetTrackIndex = useProjectStore(state => state.recordingTargetTrackIndex);
  const recordingCommitStartBeatAbsolute = useProjectStore(state => state.recordingCommitStartBeatAbsolute);
  const recordingAudioPreviewCurrentBeat = useProjectStore(state => state.recordingAudioPreviewCurrentBeat);
  const recordingAudioPreviewPeaks = useProjectStore(state => state.recordingAudioPreviewPeaks);
  const recordingAudioPreviewFileName = useProjectStore(state => state.recordingAudioPreviewFileName);
  const storeTimeSignature = useProjectStore(state => state.timeSignature);
  const [containerWidth, setContainerWidth] = useState(0);
  const [resizingRegion, setResizingRegion] = useState<string | null>(null);
  const [draggingRegion, setDraggingRegion] = useState<string | null>(null);
  const [localTempRegionStyles, setLocalTempRegionStyles] = useState<Record<string, React.CSSProperties>>({});
  const [localPreviewRegionContentStyles, setLocalPreviewRegionContentStyles] = useState<Record<string, RegionPreviewContentStyle>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  
  // Refs for resize operations
  const mouseMoved = useRef(false);
  const currentResizeWidth = useRef<number | null>(null);
  const currentResizeLeft = useRef<number | null>(null);
  const currentResizeRegion = useRef<RegionUI | null>(null);
  const initialBarNumberRef = useRef<number | null>(null);
  const initialLengthRef = useRef<number | null>(null);
  const resizePreviewBaselinesRef = useRef<RegionResizePreviewBaseline[]>([]);
  const resizePreviewRegionIdsRef = useRef<string[]>([]);
  
  // Refs for drag operations
  const currentDragLeft = useRef<number | null>(null);
  const currentDragTop = useRef<number | null>(null);
  const currentDragRegion = useRef<RegionUI | null>(null);
  const dragPreviewBaselinesRef = useRef<RegionDragPreviewBaseline[]>([]);
  const dragPreviewRegionIdsRef = useRef<string[]>([]);
  const trackElementRef = useRef<HTMLDivElement | null>(null);

  const isBulkRegionEdit = (regionId: string) => selectedRegionIds.length > 1 && selectedRegionIds.includes(regionId);
  const tempRegionStyles = previewRegionStyles ?? localTempRegionStyles;
  const setTempRegionStyles = setPreviewRegionStyles ?? setLocalTempRegionStyles;
  const tempPreviewRegionContentStyles = previewRegionContentStyles ?? localPreviewRegionContentStyles;
  const setTempPreviewRegionContentStyles = setPreviewRegionContentStyles ?? setLocalPreviewRegionContentStyles;

  const getPreviewRegionIds = (regionId: string) => (
    selectedRegionIds.length > 1 && selectedRegionIds.includes(regionId)
      ? selectedRegionIds
      : [regionId]
  );

  const clearTempRegionStyles = (regionIds?: string[]) => {
    if (!regionIds || regionIds.length === 0) {
      setTempRegionStyles({});
      return;
    }

    setTempRegionStyles(prev => {
      const updated = { ...prev };
      regionIds.forEach(id => {
        delete updated[id];
      });
      return updated;
    });
  };

  const clearTempPreviewRegionContentStyles = (regionIds?: string[]) => {
    if (!regionIds || regionIds.length === 0) {
      setTempPreviewRegionContentStyles({});
      return;
    }

    setTempPreviewRegionContentStyles(prev => {
      const updated = { ...prev };
      regionIds.forEach(id => {
        delete updated[id];
      });
      return updated;
    });
  };

  const getMeasuredRegionContentWidth = (regionId: string, fallbackWidth: number) => {
    const regionElement = Array.from(document.querySelectorAll<HTMLElement>('[data-region-id]'))
      .find(element => element.getAttribute('data-region-id') === regionId);
    const regionContentElement = regionElement?.querySelector<HTMLElement>('.region-content');
    const measuredWidth = regionContentElement?.getBoundingClientRect().width;

    if (!measuredWidth || Number.isNaN(measuredWidth)) {
      return fallbackWidth;
    }

    return measuredWidth;
  };

  // Update container width when the grid container changes size
  useEffect(() => {
    if (!gridContainerRef.current) return;
    
    setContainerWidth(gridContainerRef.current.clientWidth);
    
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    
    resizeObserver.observe(gridContainerRef.current);
    
    return () => {
      if (gridContainerRef.current) {
        resizeObserver.unobserve(gridContainerRef.current);
      }
    };
  }, [gridContainerRef]);

  // Track tool state for cursor feedback.
  useEffect(() => {
    const syncCursorState = (event?: KeyboardEvent | MouseEvent) => {
      const isPencilMode = KGMainContentState.instance().getActiveTool() === 'pencil';
      const hasModifierPressed = event ? isModifierKeyPressed(event) : false;
      setIsModifierPressed(isPencilMode || hasModifierPressed);
    };
    const syncCursorStateFromFocus = () => {
      setIsModifierPressed(KGMainContentState.instance().getActiveTool() === 'pencil');
    };

    // Add global event listeners
    window.addEventListener('keydown', syncCursorState);
    window.addEventListener('keyup', syncCursorState);
    window.addEventListener('focus', syncCursorStateFromFocus);
    syncCursorStateFromFocus();

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('keydown', syncCursorState);
      window.removeEventListener('keyup', syncCursorState);
      window.removeEventListener('focus', syncCursorStateFromFocus);
    };
  }, []);

  // Calculate region position and style
  const getRegionStyle = (region: RegionUI) => {
    // Check if there's a temporary style for this region during resize or drag
    if (tempRegionStyles[region.id]) {
      return tempRegionStyles[region.id];
    }
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Calculate left position (0-indexed bar number)
    const left = (region.barNumber - 1) * barWidth;
    
    // Calculate width based on region length
    const width = region.length * barWidth;
    
    return {
      left: `${left}px`,
      width: `${width}px`,
      position: 'absolute' as const, // Fixed: Use const assertion
    };
  };

  // Handle region resize start
  const handleRegionResizeStart = (regionId: string, resizeAction: ResizeAction, initialX: number) => {
    // Disable resizing in pencil mode
    if (KGMainContentState.instance().getActiveTool() === 'pencil') {
      return;
    }

    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`RESIZE START: regionId=${regionId}, action=${resizeAction}`);
    }
    
    setResizingRegion(regionId);
    
    // Reset the mouse moved flag
    mouseMoved.current = false;
    
    // Find the region being resized
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Store the region for reference
    currentResizeRegion.current = region;
    initialBarNumberRef.current = region.barNumber;
    initialLengthRef.current = region.length;
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Store the initial width and left position
    currentResizeWidth.current = region.length * barWidth;
    currentResizeLeft.current = (region.barNumber - 1) * barWidth;

    const previewRegionIds = getPreviewRegionIds(regionId);
    resizePreviewBaselinesRef.current = previewRegionIds
      .map(id => regions.find(candidate => candidate.id === id))
      .filter((candidate): candidate is RegionUI => candidate !== undefined)
      .map(candidate => ({
        regionId: candidate.id,
        originalBarNumber: candidate.barNumber,
        originalLength: candidate.length,
        originalLeft: (candidate.barNumber - 1) * barWidth,
        originalWidth: candidate.length * barWidth,
        originalContentWidth: getMeasuredRegionContentWidth(candidate.id, candidate.length * barWidth),
      }));
    resizePreviewRegionIdsRef.current = resizePreviewBaselinesRef.current.map(baseline => baseline.regionId);

    setTempRegionStyles(prev => ({
      ...prev,
      ...Object.fromEntries(resizePreviewBaselinesRef.current.map(baseline => [
        baseline.regionId,
        {
          left: `${baseline.originalLeft}px`,
          width: `${baseline.originalWidth}px`,
          position: 'absolute' as const,
        },
      ])),
    }));

    setTempPreviewRegionContentStyles(prev => ({
      ...prev,
      ...Object.fromEntries(resizePreviewBaselinesRef.current.map(baseline => [
        baseline.regionId,
        {
          left: '0px',
          width: `${baseline.originalContentWidth}px`,
        },
      ])),
    }));
  };

  // Handle region resize
  const handleRegionResize = (regionId: string, resizeAction: ResizeAction, deltaX: number) => {
    // Set the mouse moved flag to true
    mouseMoved.current = true;
    
    // Find the region being resized
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Get initial values
    const originalWidth = initialLengthRef.current! * barWidth;
    const originalLeft = (initialBarNumberRef.current! - 1) * barWidth;
    
    let newLeft = originalLeft;
    let newWidth = originalWidth;
    
    if (resizeAction === 'end') {
      // End resize: adjust width only
      newWidth = Math.max(barWidth * REGION_CONSTANTS.MIN_REGION_LENGTH, originalWidth + deltaX);
    } else if (resizeAction === 'start') {
      // Start resize: adjust both left position and width
      // Calculate maximum delta to prevent negative width
      const maxDelta = originalWidth - barWidth * REGION_CONSTANTS.MIN_REGION_LENGTH;
      const clampedDeltaX = Math.min(maxDelta, deltaX);
      
      // Adjust left position and width
      newLeft = originalLeft + clampedDeltaX;
      newWidth = originalWidth - clampedDeltaX;
    }
    
    // Store the current values in refs
    currentResizeWidth.current = newWidth;
    currentResizeLeft.current = newLeft;
    
    // Calculate the new bar number and length (not rounded yet, for smooth resizing)
    const newBarNumber = (newLeft / barWidth) + 1;
    const newLength = newWidth / barWidth;
    
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`RESIZE: regionId=${regionId}, action=${resizeAction}, deltaX=${deltaX}, newBarNumber=${newBarNumber}, newLength=${newLength}`);
    }
    
    const leftDelta = newLeft - originalLeft;
    const widthDelta = newWidth - originalWidth;
    const previewBaselines = resizePreviewBaselinesRef.current.length > 0
      ? resizePreviewBaselinesRef.current
      : [{
        regionId,
        originalBarNumber: region.barNumber,
        originalLength: region.length,
        originalLeft,
        originalWidth,
        originalContentWidth: getMeasuredRegionContentWidth(regionId, originalWidth),
      }];

    setTempRegionStyles(prev => ({
      ...prev,
      ...Object.fromEntries(previewBaselines.map(baseline => [
        baseline.regionId,
        {
          left: `${resizeAction === 'start' ? baseline.originalLeft + leftDelta : baseline.originalLeft}px`,
          width: `${baseline.originalWidth + widthDelta}px`,
          position: 'absolute' as const,
        },
      ])),
    }));

    setTempPreviewRegionContentStyles(prev => ({
      ...prev,
      ...Object.fromEntries(previewBaselines.map(baseline => [
        baseline.regionId,
        {
          left: `${resizeAction === 'start' ? -(newLeft - originalLeft) : 0}px`,
          width: `${baseline.originalContentWidth}px`,
        },
      ])),
    }));
    
    // Notify parent about resize
    if (onRegionResize) {
      onRegionResize(regionId, newBarNumber, newLength);
    }
  };

  // Handle region resize end
  const handleRegionResizeEnd = (regionId: string, resizeAction: ResizeAction) => {
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`RESIZE END: regionId=${regionId}, action=${resizeAction}, mouseMoved=${mouseMoved.current}`);
      console.log('Current resize width from ref:', currentResizeWidth.current);
      console.log('Current resize left from ref:', currentResizeLeft.current);
    }
    
    // Find the region being resized
    const region = regions.find(r => r.id === regionId) || currentResizeRegion.current;
    if (!region) {
      console.error(`Region not found: ${regionId}`);
      return;
    }
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    let newBarNumber = region.barNumber; // Default to current bar number
    let newLength = region.length; // Default to current length
    
    // If the mouse was moved and we have current values, calculate the new values
    if (mouseMoved.current && currentResizeWidth.current !== null && currentResizeLeft.current !== null) {
      const snap = KGMainContentState.instance().isSnappingEnabled();

      if (resizeAction === 'end') {
        // End resize: snap length to nearest bar, or use raw value
        const rawLength = currentResizeWidth.current / barWidth;
        newLength = Math.max(REGION_CONSTANTS.MIN_REGION_LENGTH, snap ? Math.round(rawLength) : rawLength);
      } else if (resizeAction === 'start') {
        // Start resize: snap bar number, or use raw value
        const rawBarNumber = currentResizeLeft.current / barWidth + 1;
        newBarNumber = Math.max(1, snap ? Math.round(rawBarNumber) : rawBarNumber);

        // Calculate the difference from the initial position
        const barDiff = initialBarNumberRef.current! - newBarNumber;

        // Adjust length to maintain the end position
        newLength = initialLengthRef.current! + barDiff;

        // Ensure minimum length
        if (newLength < REGION_CONSTANTS.MIN_REGION_LENGTH) {
          newLength = REGION_CONSTANTS.MIN_REGION_LENGTH;
          newBarNumber = initialBarNumberRef.current! + initialLengthRef.current! - REGION_CONSTANTS.MIN_REGION_LENGTH;
        }
      }
      
      if (DEBUG_MODE.TRACK_GRID_ITEM) {
        console.log(`Calculated new values: barNumber=${newBarNumber}, length=${newLength}`);
      }
    } else if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`Using existing values: barNumber=${newBarNumber}, length=${newLength}`);
    }
    
    // Clear resizing state
    setResizingRegion(null);
    clearTempRegionStyles(resizePreviewRegionIdsRef.current);
    clearTempPreviewRegionContentStyles(resizePreviewRegionIdsRef.current);
    currentResizeWidth.current = null;
    currentResizeLeft.current = null;
    currentResizeRegion.current = null;
    initialBarNumberRef.current = null;
    initialLengthRef.current = null;
    resizePreviewBaselinesRef.current = [];
    resizePreviewRegionIdsRef.current = [];
    
    // Notify parent about resize end with rounded values
    if (onRegionResizeEnd) {
      onRegionResizeEnd(regionId, newBarNumber, newLength);
    }
  };

  // Handle region drag start
  const handleRegionDragStart = (regionId: string, initialX: number, initialY: number) => {
    // Disable dragging in pencil mode
    if (KGMainContentState.instance().getActiveTool() === 'pencil') {
      return;
    }

    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`DRAG START: regionId=${regionId}`);
    }
    
    setDraggingRegion(regionId);
    
    // Reset the mouse moved flag
    mouseMoved.current = false;
    
    // Find the region being dragged
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Store the region for reference
    currentDragRegion.current = region;
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Calculate the left position
    const left = (region.barNumber - 1) * barWidth;
    const width = region.length * barWidth;
    
    // Store the initial position
    currentDragLeft.current = left;
    currentDragTop.current = 0; // Initially at the top of the current track

    const previewRegionIds = getPreviewRegionIds(regionId);
    dragPreviewBaselinesRef.current = previewRegionIds
      .map(id => regions.find(candidate => candidate.id === id))
      .filter((candidate): candidate is RegionUI => candidate !== undefined)
      .map(candidate => ({
        regionId: candidate.id,
        originalBarNumber: candidate.barNumber,
        originalTrackIndex: candidate.trackIndex,
        originalLeft: (candidate.barNumber - 1) * barWidth,
        originalWidth: candidate.length * barWidth,
      }));
    dragPreviewRegionIdsRef.current = dragPreviewBaselinesRef.current.map(baseline => baseline.regionId);

    setTempRegionStyles(prev => ({
      ...prev,
      ...Object.fromEntries(dragPreviewBaselinesRef.current.map(baseline => [
        baseline.regionId,
        {
          left: `${baseline.originalLeft}px`,
          width: `${baseline.originalWidth}px`,
          position: 'absolute' as const,
          zIndex: 100,
          transform: 'translateY(0px)',
        },
      ])),
    }));
  };

  // Handle region drag
  const handleRegionDrag = (regionId: string, deltaX: number, deltaY: number) => {
    // Set the mouse moved flag to true
    mouseMoved.current = true;
    
    // Find the region being dragged
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Get the initial left position
    const initialLeft = (region.barNumber - 1) * barWidth;
    
    const isBulkEdit = isBulkRegionEdit(regionId);
    const appliedDeltaY = isBulkEdit ? 0 : deltaY;

    // Calculate new left position
    const newLeft = initialLeft + deltaX;
    
    // Calculate the new bar number (not rounded yet, for smooth dragging)
    const newBarNumber = (newLeft / barWidth) + 1;
    
    // Store the current drag position for use in handleRegionDragEnd
    currentDragLeft.current = newLeft;
    currentDragTop.current = appliedDeltaY;
    
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`DRAG: regionId=${regionId}, deltaX=${deltaX}, deltaY=${deltaY}, newBarNumber=${newBarNumber}`);
    }
    
    const leftDelta = newLeft - initialLeft;
    const previewBaselines = dragPreviewBaselinesRef.current.length > 0
      ? dragPreviewBaselinesRef.current
      : [{
        regionId,
        originalBarNumber: region.barNumber,
        originalTrackIndex: region.trackIndex,
        originalLeft: initialLeft,
        originalWidth: region.length * barWidth,
      }];

    setTempRegionStyles(prev => ({
      ...prev,
      ...Object.fromEntries(previewBaselines.map(baseline => [
        baseline.regionId,
        {
          left: `${baseline.originalLeft + leftDelta}px`,
          width: `${baseline.originalWidth}px`,
          position: 'absolute' as const,
          zIndex: 100,
          transform: `translateY(${appliedDeltaY}px)`,
        },
      ])),
    }));
    
    // We'll calculate the track index on drag end, but still notify parent about the drag
    if (onRegionDrag) {
      onRegionDrag(regionId, newBarNumber, region.trackIndex);
    }
  };

  // Handle region drag end
  const handleRegionDragEnd = (regionId: string) => {
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`DRAG END: regionId=${regionId}, mouseMoved=${mouseMoved.current}`);
    }
    
    // Find the region being dragged
    const region = regions.find(r => r.id === regionId) || currentDragRegion.current;
    if (!region) {
      console.error(`Region not found: ${regionId}`);
      return;
    }
    
    // Calculate the width of each bar
    const barWidth = containerWidth / maxBars;
    
    // Default to current position
    let finalBarNumber = region.barNumber;
    let finalTrackIndex = region.trackIndex;
    
    // If the mouse was moved, calculate the final position
    if (mouseMoved.current && currentDragLeft.current !== null && currentDragTop.current !== null) {
      const isBulkEdit = isBulkRegionEdit(regionId);
      // Calculate the new bar number; snap to nearest integer when snapping is on
      const snap = KGMainContentState.instance().isSnappingEnabled();
      const rawBarNumber = (currentDragLeft.current / barWidth) + 1;
      finalBarNumber = Math.max(1, snap ? Math.round(rawBarNumber) : rawBarNumber);
      
      // Calculate the closest track based on vertical position
      if (!isBulkEdit && allTracks && allTracks.length > 0 && gridContainerRef.current) {
        const trackHeight = gridContainerRef.current.clientHeight / allTracks.length;
        
        // Calculate the absolute vertical position
        const originTrackTop = region.trackIndex * trackHeight;
        const absoluteY = originTrackTop + currentDragTop.current;
        
        // Find the closest track index
        const closestTrackIndex = Math.max(0, Math.min(
          allTracks.length - 1,
          Math.round(absoluteY / trackHeight)
        ));
        
        finalTrackIndex = closestTrackIndex;
        
        if (DEBUG_MODE.TRACK_GRID_ITEM) {
          console.log(`Calculated closest track: ${finalTrackIndex} (from Y=${currentDragTop.current}, absoluteY=${absoluteY}, trackHeight=${trackHeight})`);
          if (finalTrackIndex !== region.trackIndex) {
            console.log(`Track change: from trackIndex=${region.trackIndex} (trackId=${region.trackId}) to trackIndex=${finalTrackIndex} (trackId=${allTracks[finalTrackIndex].getId()})`);
          }
        }
      } else {
        finalTrackIndex = region.trackIndex;
      }
      
      if (DEBUG_MODE.TRACK_GRID_ITEM) {
        console.log(`Final position: barNumber=${finalBarNumber}, trackIndex=${finalTrackIndex}`);
      }
    }
    
    // Clear dragging state
    setDraggingRegion(null);
    clearTempRegionStyles(dragPreviewRegionIdsRef.current);
    clearTempPreviewRegionContentStyles(dragPreviewRegionIdsRef.current);
    currentDragLeft.current = null;
    currentDragTop.current = null;
    currentDragRegion.current = null;
    dragPreviewBaselinesRef.current = [];
    dragPreviewRegionIdsRef.current = [];
    
    if (finalBarNumber === region.barNumber && finalTrackIndex === region.trackIndex) {
      if (DEBUG_MODE.TRACK_GRID_ITEM) {
        console.log(`Skipping no-op drag update for region ${regionId}`);
      }
      return;
    }

    // Notify parent about drag end with final values
    if (onRegionDragEnd) {
      onRegionDragEnd(regionId, finalBarNumber, finalTrackIndex);
    }
  };

  // Handle fine-move end — convert raw pixel delta to delta in bars and pass up
  const handleRegionFineMoveEnd = (regionId: string, rawPixelDelta: number) => {
    const barWidth = containerWidth / maxBars;
    if (barWidth <= 0) return;
    const deltaInBars = (rawPixelDelta * REGION_CONSTANTS.FINE_MOVE_SPEED_RATIO) / barWidth;
    onRegionFineMoveEnd?.(regionId, deltaInBars);
  };

  // Handle region click
  const handleRegionClick = (regionId: string, options: RegionClickOptions) => {
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`Region clicked: ${regionId}`);
    }
    
    if (onRegionClick) {
      onRegionClick(regionId, options);
    }
  };

  // Filter regions for this track
  const trackRegions = regions.filter(region => region.trackIndex === index);
  const isAutomationActive = activeTrackAutomationTrackId === track.getId().toString() && activeTrackAutomationType !== null;
  const shouldRenderRecordingPreview = recordingMode === 'audio'
    && recordingTargetTrackIndex === index
    && recordingAudioPreviewCurrentBeat >= recordingCommitStartBeatAbsolute;
  const previewRegionStyle = shouldRenderRecordingPreview
    ? {
        left: `${(recordingCommitStartBeatAbsolute / storeTimeSignature.numerator) * (containerWidth / maxBars)}px`,
        width: `${Math.max(0, ((recordingAudioPreviewCurrentBeat - recordingCommitStartBeatAbsolute) / storeTimeSignature.numerator) * (containerWidth / maxBars))}px`,
        position: 'absolute' as const,
      }
    : null;

  return (
    <div
      className={`track-grid ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isModifierPressed ? 'pencil-cursor' : ''} ${isAutomationActive ? 'automation-active' : ''}`}
      data-test-id={`track-grid-${track.getId()}`}
      data-track-index={index}
      data-track-type={track.getType()}
      onDoubleClick={(e) => {
        if (!isAutomationActive) {
          onDoubleClick(e, index);
        }
      }}
      onClick={(e) => {
        if (!isAutomationActive) {
          onClick?.(e, index);
        }
      }}
      ref={trackElementRef}
      onDragOver={(e) => {
        if (
          Array.from(e.dataTransfer.types).includes('application/kgone-clip')
          || Array.from(e.dataTransfer.types).includes(CHORD_REGION_IMPORT_MIME_TYPE)
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        if (Array.from(e.dataTransfer.types).includes('application/kgone-clip')) {
          e.preventDefault();
          onKGOneClipDrop?.(e, index);
          return;
        }

        if (Array.from(e.dataTransfer.types).includes(CHORD_REGION_IMPORT_MIME_TYPE)) {
          e.preventDefault();
          onChordRegionDrop?.(e, index);
        }
      }}
    >
      {/* Render regions for this track */}
      {trackRegions.map(region => {
        // Find the corresponding region in the track
        const coreRegion = track.getRegions().find(r => r.getId() === region.id);
        const midiRegion = coreRegion?.getCurrentType() === 'KGMidiRegion' ? coreRegion as unknown as KGMidiRegion : undefined;
        const audioRegion = coreRegion?.getCurrentType() === 'KGAudioRegion' ? coreRegion as unknown as KGAudioRegion : undefined;

        // Get audio buffer for waveform rendering
        let audioBuffer: AudioBuffer | undefined;
        if (audioRegion) {
          audioBuffer = KGAudioInterface.instance().getAudioBuffer(
            track.getId().toString(),
            audioRegion.getAudioFileId()
          );
        }

        return (
          <RegionItem
            key={region.id}
            id={region.id}
            name={region.name}
            style={getRegionStyle(region)}
            barNumber={region.barNumber}
            length={region.length}
            trackIndex={index}
            onResizeStart={handleRegionResizeStart}
            onResize={handleRegionResize}
            onResizeEnd={handleRegionResizeEnd}
            onDragStart={handleRegionDragStart}
            onDrag={handleRegionDrag}
            onDragEnd={handleRegionDragEnd}
            onFineMoveEnd={handleRegionFineMoveEnd}
            // Keep onClick for selection-only logic if needed by parent
            onClick={handleRegionClick}
            // New explicit pencil action — disabled for audio regions
            onOpenPianoRoll={audioRegion ? undefined : (regionId) => {
              if (onOpenPianoRoll) {
                onOpenPianoRoll(regionId);
              } else if (onRegionClick) {
                // Fallback to legacy behavior
                onRegionClick(regionId, { shiftKey: false, metaKey: false, ctrlKey: false });
              }
            }}
            onOpenWaveform={audioRegion ? (regionId) => {
              onOpenWaveform?.(regionId);
            } : undefined}
            onOpenSpectrogram={audioRegion ? (regionId) => {
              onOpenSpectrogram?.(regionId);
            } : undefined}
            showHybridButton={audioRegion ? showHybridButtonForAudio : showHybridButtonForMidi}
            onOpenHybrid={onOpenHybrid}
            midiRegion={midiRegion}
            audioRegion={audioRegion}
            audioBuffer={audioBuffer}
            previewContentStyle={tempPreviewRegionContentStyles[region.id]}
            redrawVersion={audioWaveformRedrawVersion}
          />
        );
      })}
      {shouldRenderRecordingPreview && previewRegionStyle && (
        <RegionItem
          key="audio-recording-preview"
          id="audio-recording-preview"
          name={recordingAudioPreviewFileName ?? 'Recording'}
          style={previewRegionStyle}
          barNumber={(recordingCommitStartBeatAbsolute / storeTimeSignature.numerator) + 1}
          length={(recordingAudioPreviewCurrentBeat - recordingCommitStartBeatAbsolute) / storeTimeSignature.numerator}
          trackIndex={index}
          previewWaveformPeaks={recordingAudioPreviewPeaks}
          isPreview
          isAudioRegion
        />
      )}
      {isAutomationActive && activeTrackAutomationType && (
        <TrackAutomationLane
          track={track}
          automationType={activeTrackAutomationType}
          maxBars={maxBars}
          timeSignature={storeTimeSignature}
          redrawVersion={trackAutomationRedrawVersion}
        />
      )}
    </div>
  );
};

export default TrackGridItem; 
