import React, { useState, useRef, useEffect } from 'react';
import './Region.css';
import { FaPencilAlt } from 'react-icons/fa';
import { MdGraphicEq } from 'react-icons/md';
import type { ResizeAction } from '../interfaces';
import { REGION_CONSTANTS, DEBUG_MODE } from '../../constants';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { useProjectStore } from '../../stores/projectStore';
import { KGMainContentState } from '../../core/state/KGMainContentState';

interface RegionItemProps {
  id: string;
  name: string;
  style: React.CSSProperties;
  // Additional props that will be needed for resize functionality
  barNumber?: number;
  length?: number;
  trackIndex?: number;
  onResizeStart?: (regionId: string, resizeAction: ResizeAction, initialX: number) => void;
  onResize?: (regionId: string, resizeAction: ResizeAction, deltaX: number) => void;
  onResizeEnd?: (regionId: string, resizeAction: ResizeAction) => void;
  // Drag props
  onDragStart?: (regionId: string, initialX: number, initialY: number) => void;
  onDrag?: (regionId: string, deltaX: number, deltaY: number) => void;
  onDragEnd?: (regionId: string) => void;
  // Click prop
  onClick?: (regionId: string) => void;
  // Explicit open piano roll action from header pencil icon
  onOpenPianoRoll?: (regionId: string) => void;
  // Open spectrogram viewer for audio regions
  onOpenSpectrogram?: (regionId: string) => void;
  // MIDI region data for rendering notes
  midiRegion?: KGMidiRegion;
  // Audio region data for rendering waveform
  audioRegion?: KGAudioRegion;
  audioBuffer?: AudioBuffer;
}

const RegionItem: React.FC<RegionItemProps> = ({
  id,
  name,
  style,
  barNumber,
  length,
  trackIndex,
  onResizeStart,
  onResize,
  onResizeEnd,
  onDragStart,
  onDrag,
  onDragEnd,
  onClick,
  onOpenPianoRoll,
  onOpenSpectrogram,
  midiRegion,
  audioRegion,
  audioBuffer
}) => {
  // Get selection state and time signature from store
  const { selectedRegionIds, timeSignature, bpm } = useProjectStore();
  const isSelected = selectedRegionIds.includes(id);
  const [cursor, setCursor] = useState<string>('pointer');
  const [resizeEdge, setResizeEdge] = useState<ResizeAction>('none');
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const initialMousePosRef = useRef<{x: number, y: number}>({x: 0, y: 0});
  // Use refs to track states for immediate access
  const isResizingRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);

  // Canvas ref for note visualization
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const regionContentRef = useRef<HTMLDivElement | null>(null);

  // Function to render notes on canvas
  const renderNotesOnCanvas = () => {
    if (!canvasRef.current || !regionContentRef.current || !midiRegion) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get the current dimensions of the region content
    const contentRect = regionContentRef.current.getBoundingClientRect();
    const width = contentRect.width;
    const height = contentRect.height;

    // Set canvas size to match the region content
    canvas.width = width;
    canvas.height = height;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Get notes from the MIDI region
    const notes = midiRegion.getNotes();
    if (notes.length === 0) {
      // No notes to render, but we can draw a reference grid or just return
      return;
    }

    // Calculate note dimensions and positioning
    const regionLengthInBeats = midiRegion.getLength();
    const beatsPerBar = timeSignature.numerator;
    const regionLengthInBars = regionLengthInBeats / beatsPerBar;

    // Calculate beats per pixel
    const beatsPerPixel = regionLengthInBeats / width;

    // Analyze the pitch range of notes in the region
    const notePitches = notes.map(note => note.getPitch());
    const minNotePitch = Math.min(...notePitches);
    const maxNotePitch = Math.max(...notePitches);
    const averagePitch = notePitches.reduce((sum, pitch) => sum + pitch, 0) / notePitches.length;
    const noteRange = maxNotePitch - minNotePitch;

    // Define display parameters
    const c4Pitch = 60; // C4 reference
    const defaultPitchSpacing = 2; // pixels per semitone
    const minPitchSpacing = 1; // minimum pixels per semitone
    const paddingSemitones = 6; // padding above and below note range

    // Calculate optimal pitch range and centering
    let displayMinPitch, displayMaxPitch, centerPitch, pitchSpacing;

    if (noteRange === 0) {
      // Single note or all notes have same pitch
      centerPitch = averagePitch;
      // Show 2 octaves around the note
      displayMinPitch = Math.max(0, centerPitch - 12);
      displayMaxPitch = Math.min(127, centerPitch + 12);
      pitchSpacing = defaultPitchSpacing;
    } else {
      // Multiple notes with different pitches
      const expandedMinPitch = Math.max(0, minNotePitch - paddingSemitones);
      const expandedMaxPitch = Math.min(127, maxNotePitch + paddingSemitones);
      const expandedRange = expandedMaxPitch - expandedMinPitch;

      // Check if we can fit all notes with default spacing
      const requiredHeight = expandedRange * defaultPitchSpacing;

      if (requiredHeight <= height) {
        // Notes fit with default spacing, center around average pitch
        displayMinPitch = expandedMinPitch;
        displayMaxPitch = expandedMaxPitch;
        centerPitch = averagePitch;
        pitchSpacing = defaultPitchSpacing;
      } else {
        // Notes don't fit, need to compress spacing
        displayMinPitch = expandedMinPitch;
        displayMaxPitch = expandedMaxPitch;
        centerPitch = averagePitch;
        pitchSpacing = Math.max(minPitchSpacing, height / expandedRange);

        if (DEBUG_MODE.REGION_ITEM) {
          console.log(`Compressing pitch spacing to ${pitchSpacing.toFixed(2)}px per semitone to fit range ${expandedRange}`);
        }
      }
    }

    // If the note range is small, fall back to centering around C4 if it's reasonable
    const displayRange = displayMaxPitch - displayMinPitch;
    if (displayRange < 24 && Math.abs(averagePitch - c4Pitch) > 12) {
      // Note range is small but far from C4, use a compromise
      const compromiseCenter = averagePitch > c4Pitch ?
        Math.min(averagePitch, c4Pitch + 12) :
        Math.max(averagePitch, c4Pitch - 12);

      displayMinPitch = Math.max(0, compromiseCenter - 12);
      displayMaxPitch = Math.min(127, compromiseCenter + 12);
      centerPitch = compromiseCenter;

      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`Using compromise center ${compromiseCenter} between notes (${averagePitch.toFixed(1)}) and C4 (${c4Pitch})`);
      }
    }

    const finalPitchRange = displayMaxPitch - displayMinPitch;

    if (DEBUG_MODE.REGION_ITEM) {
      console.log(`Pitch analysis: notes=${minNotePitch}-${maxNotePitch} (avg=${averagePitch.toFixed(1)}), display=${displayMinPitch}-${displayMaxPitch}, spacing=${pitchSpacing.toFixed(2)}px`);
    }

    // Set note rendering style
    ctx.fillStyle = 'white';
    const noteHeight = 2; // Fixed 2px height as requested

    // Render each note
    notes.forEach(note => {
      const startBeat = note.getStartBeat();
      const endBeat = note.getEndBeat();
      const pitch = note.getPitch();

      // Only render notes within our display pitch range
      if (pitch < displayMinPitch || pitch > displayMaxPitch) return;

      // Calculate note position and size
      const noteStartX = startBeat / beatsPerPixel;
      const noteWidth = (endBeat - startBeat) / beatsPerPixel;

      // Calculate Y position based on pitch using dynamic spacing
      // Higher pitches should be at the top (lower Y values)
      const pitchIndex = pitch - displayMinPitch;
      const noteY = height - (pitchIndex * pitchSpacing) - (noteHeight / 2);

      // Draw the note as a white horizontal line
      ctx.fillRect(noteStartX, noteY, noteWidth, noteHeight);
    });

    if (DEBUG_MODE.REGION_ITEM) {
      console.log(`Rendered ${notes.length} notes on canvas for region ${id}`);
    }
  };

  // Function to render audio waveform on canvas
  const renderWaveformOnCanvas = () => {
    if (!canvasRef.current || !regionContentRef.current || !audioBuffer) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const contentRect = regionContentRef.current.getBoundingClientRect();
    const width = contentRect.width;
    const height = contentRect.height;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    // Get channel data (use first channel)
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;
    const sampleRate = audioBuffer.sampleRate;

    // Calculate visible portion based on clip offset
    const clipStartOffsetSeconds = audioRegion ? audioRegion.getClipStartOffsetSeconds() : 0;
    const clipStartSample = Math.floor(clipStartOffsetSeconds * sampleRate);

    // Calculate visible duration from region length in beats
    const secondsPerBeat = 60 / bpm;
    const regionLengthBeats = audioRegion ? audioRegion.getLength() : 0;
    const visibleDurationSeconds = regionLengthBeats * secondsPerBeat;
    const visibleSamples = Math.floor(visibleDurationSeconds * sampleRate);

    // Clamp to buffer boundaries
    const renderStartSample = Math.max(0, Math.min(clipStartSample, totalSamples));
    const renderEndSample = Math.min(renderStartSample + visibleSamples, totalSamples);
    const renderSampleCount = renderEndSample - renderStartSample;

    if (renderSampleCount <= 0) return;

    // Downsample visible portion to canvas width
    const samplesPerPixel = Math.max(1, Math.floor(renderSampleCount / width));
    const centerY = height / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const startSample = renderStartSample + Math.floor(x * samplesPerPixel);
      const endSample = Math.min(startSample + samplesPerPixel, renderEndSample);

      let min = 0;
      let max = 0;
      for (let i = startSample; i < endSample; i++) {
        const val = channelData[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      // Draw vertical line from min to max amplitude
      const yMin = centerY - max * centerY;
      const yMax = centerY - min * centerY;

      ctx.moveTo(x, yMin);
      ctx.lineTo(x, yMax);
    }

    ctx.stroke();
  };

  // Create a stable reference to track note changes
  const notesRef = useRef<string>('');
  const [noteUpdateTrigger, setNoteUpdateTrigger] = useState(0);

  // Check for changes in notes and trigger re-render when needed
  useEffect(() => {
    if (!midiRegion) return;

    // Create a signature of all notes for change detection
    const notesSignature = midiRegion.getNotes()
      .map(n => `${n.getId()}-${n.getStartBeat()}-${n.getEndBeat()}-${n.getPitch()}`)
      .join(',');

    // If notes have changed, trigger a re-render
    if (notesRef.current !== notesSignature) {
      notesRef.current = notesSignature;
      setNoteUpdateTrigger(prev => prev + 1);
    }
  });

  // Set up canvas when component mounts or updates
  useEffect(() => {
    if (audioRegion && audioBuffer) {
      renderWaveformOnCanvas();
    } else {
      renderNotesOnCanvas();
    }
  }, [midiRegion, audioRegion, audioBuffer, timeSignature, bpm, id, noteUpdateTrigger, barNumber, length]);

  // Re-render canvas when region content size changes
  useEffect(() => {
    if (!regionContentRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (audioRegion && audioBuffer) {
        renderWaveformOnCanvas();
      } else {
        renderNotesOnCanvas();
      }
    });

    resizeObserver.observe(regionContentRef.current);

    return () => {
      if (regionContentRef.current) {
        resizeObserver.unobserve(regionContentRef.current);
      }
    };
  }, [midiRegion, audioRegion, audioBuffer, timeSignature, bpm]);

  // Handle mouse movement to detect edge proximity
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Skip if already resizing or dragging
    if (isResizingRef.current || isDraggingRef.current) return;

    // Disable move and resize when pencil tool is active
    const activeTool = KGMainContentState.instance().getActiveTool();
    if (activeTool === 'pencil') {
      setCursor('pointer');
      setResizeEdge('none');
      return;
    }

    const regionElement = e.currentTarget;
    const rect = regionElement.getBoundingClientRect();

    // Calculate distance from left and right edges
    const distanceFromLeft = e.clientX - rect.left;
    const distanceFromRight = rect.right - e.clientX;

    // Use the edge threshold constant from constants file
    const edgeThreshold = REGION_CONSTANTS.EDGE_THRESHOLD;

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
    // Disable move and resize when pencil tool is active
    const activeTool = KGMainContentState.instance().getActiveTool();
    if (activeTool === 'pencil') {
      // Still allow click events to pass through for region selection
      if (!hasMovedRef.current && onClick) {
        if (DEBUG_MODE.REGION_ITEM) {
          console.log(`REGION CLICKED (pencil mode): regionId=${id}`);
        }
        onClick(id);
      }
      return;
    }

    // Prevent text selection during resize/drag
    e.preventDefault();

    // Reset movement tracking
    hasMovedRef.current = false;

    // Store initial mouse position
    initialMousePosRef.current = { x: e.clientX, y: e.clientY };

    if (resizeEdge !== 'none') {
      // Start resizing
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`RESIZE START: regionId=${id}, edge=${resizeEdge}`);
      }

      setIsResizing(true);
      isResizingRef.current = true;

      // Call the onResizeStart callback if provided
      if (onResizeStart) {
        onResizeStart(id, resizeEdge, e.clientX);
      }
    } else {
      // Start dragging
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`DRAG START: regionId=${id}`);
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
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`RESIZE MOVE: regionId=${id}, edge=${resizeEdge}`);
      }

      // Calculate delta from initial position
      const deltaX = e.clientX - initialMousePosRef.current.x;

      // Call the onResize callback if provided
      if (onResize) {
        onResize(id, resizeEdge, deltaX);
      }
    } else if (isDraggingRef.current) {
      // Handle drag
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`DRAG MOVE: regionId=${id}, trackIndex=${trackIndex}`);
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
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`RESIZE END: regionId=${id}`);
      }

      setIsResizing(false);
      isResizingRef.current = false;

      // Call the onResizeEnd callback if provided
      if (onResizeEnd) {
        onResizeEnd(id, resizeEdge);
      }
    } else if (isDraggingRef.current) {
      // End dragging
      if (DEBUG_MODE.REGION_ITEM) {
        console.log(`DRAG END: regionId=${id}`);
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
        if (DEBUG_MODE.REGION_ITEM) {
          console.log(`REGION CLICKED: regionId=${id}`);
        }
        onClick(id);
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
      key={id}
      className={`track-region ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${audioRegion ? 'audio-region' : ''}`}
      style={{ ...style, cursor }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      data-region-id={id}
      data-resize-edge={resizeEdge}
      data-is-resizing={isResizing}
      data-is-dragging={isDragging}
    >
      <div className="region-header">
        {name}
      </div>
      <div className={`region-content${audioRegion ? ' audio-region-content' : ''}`} ref={regionContentRef}>
        {!audioRegion && (
          <button
            className="region-pencil-btn"
            title="Edit notes"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (DEBUG_MODE.REGION_ITEM) {
                console.log(`Pencil clicked: open piano roll for region ${id}`);
              }
              if (onOpenPianoRoll) {
                onOpenPianoRoll(id);
              } else if (onClick) {
                onClick(id);
              }
            }}
            aria-label="Open piano roll"
          >
            <FaPencilAlt size={10} />
          </button>
        )}
        {audioRegion && (
          <button
            className="region-spectrogram-btn"
            title="View melodic spectrogram"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onOpenSpectrogram) {
                onOpenSpectrogram(id);
              }
            }}
            aria-label="View spectrogram"
          >
            <MdGraphicEq size={10} />
          </button>
        )}
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default RegionItem; 