import React, { useState, useRef, useEffect } from 'react';
import { PIANO_ROLL_CONSTANTS, DEBUG_MODE } from '../../constants';
import { useProjectStore } from '../../stores/projectStore';

interface PianoNoteProps {
  id: string;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  onResizeStart?: (noteId: string, resizeEdge: 'start' | 'end', initialX: number) => void;
  onResize?: (noteId: string, resizeEdge: 'start' | 'end', deltaX: number) => void;
  onResizeEnd?: (noteId: string, resizeEdge: 'start' | 'end') => void;
  onDragStart?: (noteId: string, initialX: number, initialY: number) => void;
  onDrag?: (noteId: string, deltaX: number, deltaY: number) => void;
  onDragEnd?: (noteId: string) => void;
  onClick?: (noteId: string, e: React.MouseEvent) => void;
}

const PianoNote: React.FC<PianoNoteProps> = ({
  id,
  index,
  left,
  top,
  width,
  height,
  onResizeStart,
  onResize,
  onResizeEnd,
  onDragStart,
  onDrag,
  onDragEnd,
  onClick
}) => {
  // Get selection state from store
  const { selectedNoteIds } = useProjectStore();
  const isSelected = selectedNoteIds.includes(id);

  const [cursor, setCursor] = useState<string>('pointer');
  const [resizeEdge, setResizeEdge] = useState<'none' | 'start' | 'end'>('none');
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Use refs to track states for immediate access
  const isResizingRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const initialMousePosRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  const hasMovedRef = useRef<boolean>(false);
  
  // Handle mouse movement to detect edge proximity
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Skip if already resizing or dragging
    if (isResizingRef.current || isDraggingRef.current) return;
    
    const noteElement = e.currentTarget;
    const rect = noteElement.getBoundingClientRect();
    
    // Calculate distance from left and right edges
    const distanceFromLeft = e.clientX - rect.left;
    const distanceFromRight = rect.right - e.clientX;
    
    // Use the edge threshold constant from constants file
    const edgeThreshold = PIANO_ROLL_CONSTANTS.NOTE_EDGE_OFFSET;
    
    if (distanceFromLeft <= edgeThreshold) {
      // Near left edge - resize from start
      setCursor('ew-resize');
      setResizeEdge('start');
    } else if (distanceFromRight <= edgeThreshold) {
      // Near right edge - resize from end
      setCursor('ew-resize');
      setResizeEdge('end');
    } else {
      // Middle area - move
      setCursor('grab');
      setResizeEdge('none');
    }
  };
  
  // Reset cursor when mouse leaves
  const handleMouseLeave = () => {
    if (!isResizingRef.current && !isDraggingRef.current) {
      setCursor('default');
      setResizeEdge('none');
    }
  };
  
  // Handle mouse down for resize or drag
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent text selection during resize/drag
    e.preventDefault();
    
    // Reset movement tracking
    hasMovedRef.current = false;
    
    // Store initial mouse position
    initialMousePosRef.current = { x: e.clientX, y: e.clientY };
    
    if (resizeEdge !== 'none') {
      // Start resizing
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE RESIZE START: noteId=${id}, edge=${resizeEdge}`);
      }
      
      setIsResizing(true);
      isResizingRef.current = true;
      
      // Call the onResizeStart callback if provided
      if (onResizeStart && (resizeEdge === 'start' || resizeEdge === 'end')) {
        onResizeStart(id, resizeEdge, e.clientX);
      }
    } else {
      // Start dragging
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE DRAG START: noteId=${id}`);
      }
      
      setIsDragging(true);
      isDraggingRef.current = true;
      
      // Change cursor to grabbing during drag
      setCursor('grabbing');
      
      // Call the onDragStart callback if provided
      if (onDragStart) {
        onDragStart(id, e.clientX, e.clientY);
      }
    }
    
    // Add global event listeners for mouse move and up
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
  };
  
  // Handle global mouse move for resize or drag
  const handleGlobalMouseMove = (e: MouseEvent) => {
    // Set the hasMovedRef to true as soon as there's movement
    hasMovedRef.current = true;
    
    if (isResizingRef.current) {
      // Handle resize
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE RESIZE MOVE: noteId=${id}, edge=${resizeEdge}`);
      }
      
      // Calculate delta from initial position
      const deltaX = e.clientX - initialMousePosRef.current.x;
      
      // Call the onResize callback if provided
      if (onResize && (resizeEdge === 'start' || resizeEdge === 'end')) {
        onResize(id, resizeEdge, deltaX);
      }
    } else if (isDraggingRef.current) {
      // Handle drag
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE DRAG MOVE: noteId=${id}`);
      }
      
      // Calculate delta from initial position
      const deltaX = e.clientX - initialMousePosRef.current.x;
      const deltaY = e.clientY - initialMousePosRef.current.y;
      
      // Call the onDrag callback if provided
      if (onDrag) {
        onDrag(id, deltaX, deltaY);
      }
    }
  };
  
  // Handle global mouse up to end resize or drag
  const handleGlobalMouseUp = (e: MouseEvent) => {
    if (isResizingRef.current) {
      // End resizing
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE RESIZE END: noteId=${id}`);
      }
      
      setIsResizing(false);
      isResizingRef.current = false;
      
      // Call the onResizeEnd callback if provided
      if (onResizeEnd && (resizeEdge === 'start' || resizeEdge === 'end')) {
        onResizeEnd(id, resizeEdge);
      }
    } else if (isDraggingRef.current) {
      // End dragging
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`NOTE DRAG END: noteId=${id}`);
      }
      
      setIsDragging(false);
      isDraggingRef.current = false;
      
      // Reset cursor after drag
      setCursor('grab');
      
      // Call the onDragEnd callback if provided
      if (onDragEnd) {
        onDragEnd(id);
      }
      
      // If there was no movement, treat it as a click
      if (!hasMovedRef.current && onClick) {
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`NOTE CLICKED: noteId=${id}`);
        }
        // We can't pass the original event here since it's a MouseEvent, not a React.MouseEvent
        // But we can create a synthetic event with the current mouse position
        const clickEvent = {
          clientX: e.clientX,
          clientY: e.clientY,
          target: e.target,
          preventDefault: () => {},
          stopPropagation: () => {},
          shiftKey: e.shiftKey // Pass the shift key state
        } as unknown as React.MouseEvent;
        
        onClick(id, clickEvent);
      }
    }
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', handleGlobalMouseUp);
  };

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Keep the refs in sync with the states
  useEffect(() => {
    isResizingRef.current = isResizing;
  }, [isResizing]);
  
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  return (
    <div
      className={`piano-note ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        cursor: cursor
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      id={id}
      data-note-index={index}
      data-resize-edge={resizeEdge}
      data-is-resizing={isResizing}
      data-is-dragging={isDragging}
      data-is-selected={isSelected}
    />
  );
};

export default PianoNote; 