import React, { useState, useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { Playhead } from '../common';
import SelectionBox from './SelectionBox';
import { isModifierKeyPressed } from '../../util/osUtil';
import { generatePianoGridBackground, getMatchingChordsForPitch } from '../../util/scaleUtil';
import type { KeySignature } from '../../core/KGProject';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';

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
  selectedMode: string;
  keySignature: KeySignature;
  chordGuide: string;
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
  regionStartBeat = 0,
  selectedMode,
  keySignature,
  chordGuide
}) => {
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const [selectedChordIndex, setSelectedChordIndex] = useState(0);

  // Generate background with scale highlighting - only regenerate when mode or key changes
  const backgroundImage = useMemo(() => {
    return generatePianoGridBackground(selectedMode, keySignature);
  }, [selectedMode, keySignature]);

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

  // Get all matching chords for the current hover position
  const matchingChords = useMemo(() => {
    if (!cursorPosition) return [];

    // If chord guide is disabled, return empty array
    if (chordGuide === 'N') return [];

    // Use the utility function to get matching chords
    const functionType = chordGuide as 'T' | 'S' | 'D';
    return getMatchingChordsForPitch(cursorPosition.pitch, keySignature, selectedMode, functionType);
  }, [cursorPosition, chordGuide, keySignature, selectedMode]);

  // Calculate chord highlights based on selected chord index
  const chordHighlights = useMemo(() => {
    if (matchingChords.length === 0) return [];

    // Use the selected chord index (wrap around if needed)
    const chordIndex = selectedChordIndex % matchingChords.length;
    const matchedChordPitches = matchingChords[chordIndex];

    // Convert pitch classes to actual pitches in the same octave as cursor
    const highlights: Array<{ pitch: number; beat: number }> = [];
    const cursorOctave = Math.floor(cursorPosition!.pitch / 12);

    // For each pitch class in the chord, create highlights
    for (const pitchClass of matchedChordPitches) {
      // Calculate the actual pitch in the cursor's octave
      const actualPitch = cursorOctave * 12 + pitchClass;

      // Ensure the pitch is in valid MIDI range (0-127)
      if (actualPitch >= 0 && actualPitch <= 127) {
        highlights.push({ pitch: actualPitch, beat: cursorPosition!.beat });
      }
    }

    return highlights;
  }, [cursorPosition, matchingChords, selectedChordIndex]);

  const cursorPitch = cursorPosition?.pitch ?? null;

  useEffect(() => {
    const pianoRollState = KGPianoRollState.instance();
    pianoRollState.setCurrentMatchingChords(matchingChords);
    pianoRollState.setCurrentChordCursorPitch(cursorPitch);
  }, [matchingChords, cursorPitch]);

  useEffect(() => {
    KGPianoRollState.instance().setCurrentSelectedChordIndex(selectedChordIndex);
  }, [selectedChordIndex]);

  const lastEditedNoteLength = KGPianoRollState.instance().getLastEditedNoteLength();

  // Reset selected chord index when cursor moves to a different pitch or beat
  useEffect(() => {
    setSelectedChordIndex(0);
  }, [cursorPosition?.pitch, cursorPosition?.beat]);

  // Expose switchChord function via window for hotkey handler
  useEffect(() => {
    const switchChord = () => {
      if (matchingChords.length > 1) {
        setSelectedChordIndex(prev => (prev + 1) % matchingChords.length);
      }
    };

    // Store the function on window object so PianoRoll can call it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__pianoGridSwitchChord = switchChord;

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__pianoGridSwitchChord;
    };
  }, [matchingChords.length]);

  return (
    <div className="piano-grid-container">
      <div
        className={`piano-grid ${isModifierPressed ? 'pencil-cursor' : ''}`}
        ref={gridRef}
        style={{ backgroundImage }}
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

            {/* Chord highlights - render red boxes for each note in the matched chord */}
            {chordHighlights.map((highlight, index) => {
              const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
              const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
              const yPosition = (107 - highlight.pitch) * noteHeight; // B7 = 107, reverse for display

              return (
                <div
                  key={`chord-highlight-${index}`}
                  className="piano-grid-chord-highlight"
                  style={{
                    top: yPosition,
                    left: highlight.beat * beatWidth,
                    width: beatWidth * lastEditedNoteLength,
                    height: noteHeight
                  }}
                />
              );
            })}
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