import React, { useRef, useEffect, useCallback } from 'react';
import { KGCore } from '../../core/KGCore';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { useProjectStore } from '../../stores/projectStore';
import { DEBUG_MODE } from '../../constants';

interface PianoGridHeaderProps {
  maxBars: number;
  timeSignature?: { numerator: number; denominator: number };
}

const PianoGridHeader: React.FC<PianoGridHeaderProps> = ({ 
  maxBars, 
  timeSignature = { numerator: 4, denominator: 4 } // Default to 4/4 if not provided
}) => {
  // Get store access for playhead position updates
  const { setPlayheadPosition } = useProjectStore();
  
  // Refs for drag functionality
  const isDraggingRef = useRef(false);
  const headerElementRef = useRef<HTMLDivElement | null>(null);

  // Utility function to calculate snapped beat position (based on useNoteOperations.ts)
  const getSnappedBeatPosition = (beatPosition: number): number => {
    const currentSnap = KGPianoRollState.instance().getCurrentSnap();
    
    // If no snapping is enabled, return the original position
    if (currentSnap === 'NO SNAP') {
      return beatPosition;
    }
    
    // Parse the snap value (e.g., "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(currentSnap.split('/')[1]);
    if (isNaN(denominator)) {
      return beatPosition; // Fallback to no snapping if invalid
    }
    
    // Calculate the snap step in beats
    // snapStep should ALWAYS be 4 / denominator regardless of time signature
    const snapStep = 4 / denominator;
    
    // Use round snapping for playhead positioning
    const snappedPosition = Math.round(beatPosition / snapStep) * snapStep;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Piano Grid Header Snapping: ${beatPosition} -> ${snappedPosition} (snap: ${currentSnap}, step: ${snapStep})`);
    }
    
    return snappedPosition;
  };

  // Utility function to calculate playhead position from mouse coordinates
  const calculatePlayheadFromMouse = useCallback((clientX: number): number | null => {
    if (!headerElementRef.current) return null;
    
    const rect = headerElementRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    
    // Account for the piano keys width offset
    const pianoKeysWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
    ) || 60;
    
    const adjustedX = relativeX - pianoKeysWidth;
    
    // If the click is in the piano keys area (left side), ignore it
    if (adjustedX < 0) {
      return null;
    }
    
    // Calculate the width of each beat
    const beatWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
    ) || 40;
    
    // Calculate the raw beat position using the adjusted X position
    const rawBeatPosition = adjustedX / beatWidth;
    
    // Apply quantization if enabled
    return getSnappedBeatPosition(rawBeatPosition);
  }, []);

  // Handle mouse down to start dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only handle left mouse button
    if (e.button !== 0) return;
    
    isDraggingRef.current = true;
    
    // Calculate and set initial playhead position
    const newPosition = calculatePlayheadFromMouse(e.clientX);
    if (newPosition !== null) {
      setPlayheadPosition(newPosition);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Piano Grid Header drag started - Initial position: ${newPosition}`);
      }
    }
    
    // Prevent text selection during drag
    e.preventDefault();
  };

  // Handle click (when not dragging) - this will be the fallback for simple clicks
  const handlePianoGridHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If we were dragging, don't process as a click
    if (isDraggingRef.current) {
      return;
    }
    
    const newPosition = calculatePlayheadFromMouse(e.clientX);
    if (newPosition !== null) {
      const core = KGCore.instance();
      const currentPlayheadPosition = core.getPlayheadPosition();
      const beatsPerBar = timeSignature.numerator;
      const currentBarNumber = Math.floor(currentPlayheadPosition / beatsPerBar) + 1; // 1-indexed
      const destinationBarNumber = Math.floor(newPosition / beatsPerBar) + 1; // 1-indexed
      
      // Debug logging
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Piano Grid Header click - Position: ${newPosition}`);
        console.log(`Current bar: ${currentBarNumber} (beat ${currentPlayheadPosition})`);
        console.log(`Destination bar: ${destinationBarNumber} (beat ${newPosition})`);
      }
      
      setPlayheadPosition(newPosition);
    }
  };

  // Global mouse move and mouse up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      
      const newPosition = calculatePlayheadFromMouse(e.clientX);
      if (newPosition !== null) {
        setPlayheadPosition(newPosition);
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Piano Grid Header drag - Position: ${newPosition}`);
        }
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log('Piano Grid Header drag ended');
        }
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
  }, [calculatePlayheadFromMouse, setPlayheadPosition]);

  return (
    <div 
      className="piano-grid-header" 
      ref={headerElementRef}
      onMouseDown={handleMouseDown}
      onClick={handlePianoGridHeaderClick}
    >
      {Array.from({ length: maxBars }, (_, i) => (
        <div key={i} className="piano-bar-number">{i + 1}</div>
      ))}
    </div>
  );
};

export default PianoGridHeader; 