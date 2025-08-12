import React, { useState, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { Playhead } from '../common';
import SelectionBox from './SelectionBox';
import { isModifierKeyPressed } from '../../util/osUtil';

interface PianoGridProps {
  gridRef: MutableRefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  onDoubleClick: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  isBoxSelecting: boolean;
  selectionBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  regionStartBeat?: number;
}

interface CursorPosition {
  beat: number;
  pitch: number;
  x: number;
  y: number;
}

const PianoGrid: React.FC<PianoGridProps> = ({
  gridRef,
  children,
  onDoubleClick,
  onClick,
  onMouseDown,
  isBoxSelecting,
  selectionBox,
  regionStartBeat = 0
}) => {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [isModifierPressed, setIsModifierPressed] = useState(false);

  // Track modifier key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field (including ChatBox)
      const target = e.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

      if (isModifierKeyPressed(e)) {
        setIsModifierPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field (including ChatBox)
      const target = e.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!gridRef.current) return;
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Get CSS variables
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    
    // Calculate beat and pitch
    const beat = Math.floor(x / beatWidth);
    const pitch = 107 - Math.floor(y / noteHeight); // B7 = 107, reverse for display
    
    // Only update if position changed and cursor is within valid range
    if (beat >= 0 && pitch >= 0 && pitch <= 127) {
      setCursorPosition({ beat, pitch, x, y });
    }
  };

  const handleMouseLeave = () => {
    setCursorPosition(null);
  };

  return (
    <div className="piano-grid-container">
      <div 
        className={`piano-grid ${isModifierPressed ? 'pencil-cursor' : ''}`}
        ref={gridRef}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        onMouseDown={(e) => onMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Cursor Highlights */}
        {cursorPosition && (
          <>
            {/* Horizontal pitch row highlight */}
            <div 
              className="piano-grid-pitch-highlight"
              style={{
                top: Math.floor(cursorPosition.y / (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20)) * (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20),
                height: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20
              }}
            />
            
            {/* Vertical beat column highlight */}
            <div 
              className="piano-grid-beat-highlight"
              style={{
                left: cursorPosition.beat * (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40),
                width: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40
              }}
            />
          </>
        )}
        
        {/* Playhead */}
        <Playhead context="piano-roll" regionStartBeat={regionStartBeat} />
        
        {children}
        <SelectionBox 
          isSelecting={isBoxSelecting} 
          selectionBox={selectionBox}
        />
      </div>
    </div>
  );
};

export default PianoGrid; 