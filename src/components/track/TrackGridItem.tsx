import React, { useEffect, useState, useRef } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import RegionItem from './RegionItem';
import type { RegionUI, ResizeAction } from '../interfaces';
import { REGION_CONSTANTS, DEBUG_MODE } from '../../constants';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { isModifierKeyPressed } from '../../util/osUtil';

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
  onRegionClick?: (regionId: string) => void;
  onOpenPianoRoll?: (regionId: string) => void;
  allTracks?: KGTrack[]; // Added to access all tracks for drag operations
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
  onRegionClick,
  onOpenPianoRoll,
  allTracks
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [resizingRegion, setResizingRegion] = useState<string | null>(null);
  const [draggingRegion, setDraggingRegion] = useState<string | null>(null);
  const [tempRegionStyles, setTempRegionStyles] = useState<Record<string, React.CSSProperties>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  
  // Refs for resize operations
  const mouseMoved = useRef(false);
  const currentResizeWidth = useRef<number | null>(null);
  const currentResizeLeft = useRef<number | null>(null);
  const currentResizeRegion = useRef<RegionUI | null>(null);
  const initialBarNumberRef = useRef<number | null>(null);
  const initialLengthRef = useRef<number | null>(null);
  
  // Refs for drag operations
  const currentDragLeft = useRef<number | null>(null);
  const currentDragTop = useRef<number | null>(null);
  const currentDragRegion = useRef<RegionUI | null>(null);
  const trackElementRef = useRef<HTMLDivElement | null>(null);

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

  // Track modifier key state for cursor feedback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isModifierKeyPressed(e)) {
        setIsModifierPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isModifierKeyPressed(e)) {
        setIsModifierPressed(false);
      }
    };

    // Add global event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Calculate region position and style
  const getRegionStyle = (region: RegionUI) => {
    // Check if there's a temporary style for this region during resize or drag
    if ((resizingRegion === region.id || draggingRegion === region.id) && tempRegionStyles[region.id]) {
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
    
    // Set initial style to current position/size
    const initialStyle = {
      left: `${currentResizeLeft.current}px`,
      width: `${currentResizeWidth.current}px`,
      position: 'absolute' as const, // Fixed: Use const assertion
    };
    
    setTempRegionStyles(prev => ({
      ...prev,
      [regionId]: initialStyle
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
    
    // Update the temporary style for this region
    const newStyle = {
      left: `${newLeft}px`,
      width: `${newWidth}px`,
      position: 'absolute' as const, // Fixed: Use const assertion
    };
    
    setTempRegionStyles(prev => ({
      ...prev,
      [regionId]: newStyle
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
      if (resizeAction === 'end') {
        // End resize: round length to nearest bar
        newLength = Math.max(REGION_CONSTANTS.MIN_REGION_LENGTH, Math.round(currentResizeWidth.current / barWidth));
      } else if (resizeAction === 'start') {
        // Start resize: round bar number and adjust length accordingly
        const rawBarNumber = currentResizeLeft.current / barWidth + 1;
        newBarNumber = Math.max(1, Math.round(rawBarNumber));
        
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
    setTempRegionStyles(prev => {
      const updated = { ...prev };
      delete updated[regionId];
      return updated;
    });
    currentResizeWidth.current = null;
    currentResizeLeft.current = null;
    currentResizeRegion.current = null;
    initialBarNumberRef.current = null;
    initialLengthRef.current = null;
    
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
    
    // Set initial style
    const initialStyle = {
      left: `${left}px`,
      width: `${width}px`,
      position: 'absolute' as const, // Fixed: Use const assertion
      zIndex: 100, // Bring to front during drag
    };
    
    setTempRegionStyles(prev => ({
      ...prev,
      [regionId]: initialStyle
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
    
    // Calculate new left position
    const newLeft = initialLeft + deltaX;
    
    // Calculate the new bar number (not rounded yet, for smooth dragging)
    const newBarNumber = (newLeft / barWidth) + 1;
    
    // Store the current drag position for use in handleRegionDragEnd
    currentDragLeft.current = newLeft;
    currentDragTop.current = deltaY;
    
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`DRAG: regionId=${regionId}, deltaX=${deltaX}, deltaY=${deltaY}, newBarNumber=${newBarNumber}`);
    }
    
    // Update the temporary style for this region
    const newStyle = {
      left: `${newLeft}px`,
      width: `${region.length * barWidth}px`,
      position: 'absolute' as const,
      zIndex: 100, // Keep on top during drag
      transform: `translateY(${deltaY}px)`,
    };
    
    setTempRegionStyles(prev => ({
      ...prev,
      [regionId]: newStyle
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
      // Calculate the new bar number and round to nearest integer
      const rawBarNumber = (currentDragLeft.current / barWidth) + 1;
      finalBarNumber = Math.max(1, Math.round(rawBarNumber));
      
      // Calculate the closest track based on vertical position
      if (allTracks && allTracks.length > 0 && gridContainerRef.current) {
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
      }
      
      if (DEBUG_MODE.TRACK_GRID_ITEM) {
        console.log(`Final position: barNumber=${finalBarNumber}, trackIndex=${finalTrackIndex}`);
      }
    }
    
    // Clear dragging state
    setDraggingRegion(null);
    setTempRegionStyles(prev => {
      const updated = { ...prev };
      delete updated[regionId];
      return updated;
    });
    currentDragLeft.current = null;
    currentDragTop.current = null;
    currentDragRegion.current = null;
    
    // Notify parent about drag end with final values
    if (onRegionDragEnd) {
      onRegionDragEnd(regionId, finalBarNumber, finalTrackIndex);
    }
  };

  // Handle region click
  const handleRegionClick = (regionId: string) => {
    if (DEBUG_MODE.TRACK_GRID_ITEM) {
      console.log(`Region clicked: ${regionId}`);
    }
    
    if (onRegionClick) {
      onRegionClick(regionId);
    }
  };

  // Filter regions for this track
  const trackRegions = regions.filter(region => region.trackIndex === index);

  return (
    <div 
      className={`track-grid ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isModifierPressed ? 'pencil-cursor' : ''}`}
      data-test-id={`track-grid-${track.getId()}`}
      onDoubleClick={(e) => onDoubleClick(e, index)}
      onClick={(e) => onClick && onClick(e, index)}
      ref={trackElementRef}
    >
      {/* Render regions for this track */}
      {trackRegions.map(region => {
        // Find the corresponding KGMidiRegion in the track
        const midiRegion = track.getRegions().find(r => r.getId() === region.id) as KGMidiRegion | undefined;
        
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
            // Keep onClick for selection-only logic if needed by parent
            onClick={handleRegionClick}
            // New explicit pencil action
            onOpenPianoRoll={(regionId) => {
              if (onOpenPianoRoll) {
                onOpenPianoRoll(regionId);
              } else if (onRegionClick) {
                // Fallback to legacy behavior
                onRegionClick(regionId);
              }
            }}
            midiRegion={midiRegion}
          />
        );
      })}
    </div>
  );
};

export default TrackGridItem; 