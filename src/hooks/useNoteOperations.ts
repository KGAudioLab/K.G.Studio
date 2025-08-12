import { useState, useRef } from 'react';
import { DEBUG_MODE, PIANO_ROLL_CONSTANTS } from '../constants';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { beatsToBar, pitchToNoteNameString, pianoRollIndexToPitch, pitchToNoteName } from '../util/midiUtil';
import { isModifierKeyPressed } from '../util/osUtil';
import { KGTrack } from '../core/track/KGTrack';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import type { MutableRefObject } from 'react';
import { KGCore } from '../core/KGCore';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { KGAudioInterface } from '../core/audio-interface/KGAudioInterface';
import { CreateNoteCommand, DeleteNotesCommand, ResizeNotesCommand, MoveNotesCommand } from '../core/commands';

interface UseNoteOperationsProps {
  activeRegion: KGMidiRegion | null;
  timeSignature: { numerator: number; denominator: number };
  updateTrack: (track: KGTrack) => void;
  tracks: KGTrack[];
  pianoGridRef: MutableRefObject<HTMLDivElement | null>;
}

export const useNoteOperations = ({
  activeRegion,
  timeSignature,
  updateTrack,
  tracks,
  pianoGridRef
}: UseNoteOperationsProps) => {
  // State for note resizing
  const [resizingNoteId, setResizingNoteId] = useState<string | null>(null);
  const [tempNoteStyles, setTempNoteStyles] = useState<Record<string, React.CSSProperties>>({});
  
  // State for note dragging
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  
  // Refs for resize operations
  const currentResizeWidth = useRef<number | null>(null);
  const currentResizeLeft = useRef<number | null>(null);
  const initialStartBeatRef = useRef<number | null>(null);
  const initialEndBeatRef = useRef<number | null>(null);
  
  // Refs for drag operations
  const initialDragLeft = useRef<number | null>(null);
  const initialDragTop = useRef<number | null>(null);
  const currentDragLeft = useRef<number | null>(null);
  const currentDragTop = useRef<number | null>(null);
  const initialPitchRef = useRef<number | null>(null);
  
  // Counter to trigger re-renders when notes are updated
  const [noteUpdateCounter, setNoteUpdateCounter] = useState(0);

  // Get KGCore instance for accessing selected items
  const core = KGCore.instance();
  
  // Utility function to calculate snapped beat position
  const getSnappedBeatPosition = (beatPosition: number, timeSignature: { numerator: number; denominator: number }, useFloorSnapping: boolean = false): number => {
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
    // In a 4/4 time signature, a quarter note (1/4) is 1 beat
    // In a 6/8 time signature, an eighth note (1/8) is 1 beat
    // const { numerator: timeSigNumerator, denominator: timeSigDenominator } = timeSignature;
    
    // Calculate beats per whole note based on time signature
    // const beatsPerWholeNote = timeSigNumerator * (4 / timeSigDenominator);
    
    // Calculate the snap step in beats
    // snapStep should ALWAYS be 4 / denominator regardless of time signature
    const snapStep = 4 / denominator;
    
    // Choose snapping method: floor for note creation, round for dragging
    const snappedPosition = useFloorSnapping 
      ? Math.floor(beatPosition / snapStep) * snapStep
      : Math.round(beatPosition / snapStep) * snapStep;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Snapping (${useFloorSnapping ? 'floor' : 'round'}): ${beatPosition} -> ${snappedPosition} (snap: ${currentSnap}, step: ${snapStep})`);
    }
    
    return snappedPosition;
  };

  // Utility function to calculate snapped note length
  const getSnappedLength = (length: number, timeSignature: { numerator: number; denominator: number }): number => {
    const currentSnap = KGPianoRollState.instance().getCurrentSnap();
    
    // If no snapping is enabled, return the original length
    if (currentSnap === 'NO SNAP') {
      return length;
    }
    
    // Parse the snap value (e.g., "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(currentSnap.split('/')[1]);
    if (isNaN(denominator)) {
      return length; // Fallback to no snapping if invalid
    }
    
    // Calculate the snap step in beats using same formula as position snapping
    // const { numerator, denominator: timeSigDenominator } = timeSignature;
    // const beatsPerWholeNote = numerator * (4 / timeSigDenominator);
    // snapStep should ALWAYS be 4 / denominator regardless of time signature
    const snapStep = 4 / denominator;
    
    // Snap length to nearest multiple of snap step
    const snappedLength = Math.round(length / snapStep) * snapStep;
    
    // Ensure minimum note length is respected
    const finalLength = Math.max(PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH, snappedLength);
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Length snapping: ${length} -> ${finalLength} (snap: ${currentSnap}, step: ${snapStep})`);
    }
    
    return finalLength;
  };

  // Utility function to delete selected notes from the active region using commands
  const deleteSelectedNotes = () => {
    if (!activeRegion) return false;
    
    // Get all selected notes
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];
    
    if (selectedNotes.length === 0) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('No notes selected for deletion');
      }
      return false;
    }
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Deleting ${selectedNotes.length} selected notes using command`);
    }
    
    // Create and execute the delete notes command
    const noteIds = selectedNotes.map(note => note.getId());
    const command = new DeleteNotesCommand(noteIds);
    core.executeCommand(command);
    
    // Find the track that contains this region and update it for UI sync
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }
    
    // Trigger a re-render by incrementing the note update counter
    setNoteUpdateCounter(prev => prev + 1);
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Deleted ${selectedNotes.length} notes using DeleteNotesCommand`);
    }
    
    return true;
  };

  // Utility function to add a note to the active region using commands
  const addNoteToActiveRegion = (mouseX: number, mouseY: number) => {
    if (!pianoGridRef.current || !activeRegion) return;
    
    // Get the grid element's bounding rectangle
    const rect = pianoGridRef.current.getBoundingClientRect();
    
    // Calculate relative position within the grid
    const x = mouseX - rect.left;
    const y = mouseY - rect.top + PIANO_ROLL_CONSTANTS.PIANO_KEY_CLICK_Y_OFFSET;
    
    // Get the CSS variables for beat width and note height
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    
    // Calculate the beat number (0-indexed) and apply floor snapping for note creation
    const rawBeatNumber = x / beatWidth;
    const currentSnap = KGPianoRollState.instance().getCurrentSnap();
    const beatNumber = currentSnap === 'NO SNAP' 
      ? Math.floor(rawBeatNumber)  // Snap to 1-beat grid when no snapping is selected
      : getSnappedBeatPosition(rawBeatNumber, timeSignature, true); // Use floor snapping for note creation
    
    // Calculate the pitch (MIDI note number)
    // The piano roll is drawn from bottom to top, with higher notes at the top
    const pitch = pianoRollIndexToPitch(Math.floor(y / noteHeight));
    
    // Get the note name for logging
    const { note, octave } = pitchToNoteName(pitch);
    const { bar, beatInBar } = beatsToBar(beatNumber, timeSignature);
    
    // Log the information if debug mode is on
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Creating note at position: x=${x}, y=${y}`);
      console.log(`Beat: ${beatNumber} (${bar + 1}:${beatInBar + 1}), Pitch: ${pitch} (${note}${octave})`);
    }

    // Calculate note timing relative to the region
    const regionStartBeat = activeRegion.getStartFromBeat();
    const noteStartBeat = beatNumber - regionStartBeat; // relative beat position
    const lastEditedLength = KGPianoRollState.instance().getLastEditedNoteLength();
    const noteEndBeat = noteStartBeat + lastEditedLength; // Use last edited note length
    const velocity = 127; // Maximum velocity

    // Create and execute the note creation command
    const command = new CreateNoteCommand(
      activeRegion.getId(),
      noteStartBeat,
      noteEndBeat,
      pitch,
      velocity
    );

    core.executeCommand(command);

    // Get the created note for audio preview
    const createdNote = command.getCreatedNote();

    // Increment the note update counter to trigger a re-render
    setNoteUpdateCounter((prev: number) => prev + 1);

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Created note using command: startBeat=${noteStartBeat}, endBeat=${noteEndBeat}, pitch=${pitch}`);
    }

    // Find the track that contains this region and update it for UI sync
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
      
      // Play note preview if audio interface is ready and note was created
      if (createdNote) {
        const audioInterface = KGAudioInterface.instance();
        if (audioInterface.getIsInitialized()) {
          // Try to start audio context if not started yet (user interaction will allow this)
          if (!audioInterface.getIsAudioContextStarted()) {
            audioInterface.startAudioContext().catch(() => {
              // Silently fail if still not allowed - browser policy
            });
          }
          
          // Trigger note if audio context is now started
          if (audioInterface.getIsAudioContextStarted()) {
            audioInterface.triggerNote(track.getId().toString(), createdNote);
          }
        }
      }
    }
  };

  // Handle double click on the piano grid
  const handleGridDoubleClick = (e: React.MouseEvent) => {
    addNoteToActiveRegion(e.clientX, e.clientY);
  };

  // Handle single click on the piano grid for pencil mode or modifier+click
  const handleGridClick = (e: React.MouseEvent) => {
    // Create notes on single click in pencil mode OR when modifier key is pressed
    if (KGPianoRollState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(e)) {
      addNoteToActiveRegion(e.clientX, e.clientY);
    }
  };

  // Handle note resize start
  const handleNoteResizeStart = (noteId: string, resizeEdge: 'start' | 'end', initialX: number) => {
    if (!activeRegion) return;
    
    // Disable resizing in pencil mode
    if (KGPianoRollState.instance().getActiveTool() === 'pencil') {
      return;
    }
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE RESIZE START: noteId=${noteId}, edge=${resizeEdge}`);
    }
    
    setResizingNoteId(noteId);
    
    // Find the note being resized
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Store the initial start and end beats
    initialStartBeatRef.current = note.getStartBeat();
    initialEndBeatRef.current = note.getEndBeat();
    
    // Get the beat width
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    
    // Calculate the region's start beat (for absolute positioning)
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    // Calculate the absolute start and end beats
    const absStartBeat = note.getStartBeat() + regionStartBeat;
    const absEndBeat = note.getEndBeat() + regionStartBeat;
    
    // Calculate the note's position and dimensions
    const left = absStartBeat * beatWidth;
    const width = (absEndBeat - absStartBeat) * beatWidth;
    
    // Store the initial width and left position
    currentResizeWidth.current = width;
    currentResizeLeft.current = left;
    
    // Set initial style to current position/size
    const initialStyle = {
      left: `${left}px`,
      width: `${width}px`,
    };
    
    setTempNoteStyles(prev => ({
      ...prev,
      [noteId]: initialStyle
    }));
  };

  // Handle note resize
  const handleNoteResize = (noteId: string, resizeEdge: 'start' | 'end', deltaX: number) => {
    if (!activeRegion) return;
    
    // Find the note being resized
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Get the beat width
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    
    // Calculate the region's start beat (for absolute positioning)
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    // Get initial values
    if (initialStartBeatRef.current === null || initialEndBeatRef.current === null ||
        currentResizeWidth.current === null || currentResizeLeft.current === null) {
      return;
    }
    
    // Calculate the absolute start and end beats
    const absStartBeat = initialStartBeatRef.current + regionStartBeat;
    const absEndBeat = initialEndBeatRef.current + regionStartBeat;
    
    // Calculate the original position and dimensions
    const originalLeft = absStartBeat * beatWidth;
    const originalWidth = (absEndBeat - absStartBeat) * beatWidth;
    
    // Calculate minimum width in pixels
    const minWidth = beatWidth * PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH;
    
    let newLeft = originalLeft;
    let newWidth = originalWidth;
    
    if (resizeEdge === 'end') {
      // End resize: adjust width only
      newWidth = Math.max(minWidth, originalWidth + deltaX);
    } else if (resizeEdge === 'start') {
      // Start resize: adjust both left position and width
      // Calculate maximum delta to prevent negative width
      const maxDelta = originalWidth - minWidth;
      const clampedDeltaX = Math.min(maxDelta, deltaX);
      
      // Adjust left position and width
      newLeft = originalLeft + clampedDeltaX;
      newWidth = originalWidth - clampedDeltaX;
    }
    
    // Apply length snapping to the visual feedback
    const newLengthInBeats = newWidth / beatWidth;
    const snappedLengthInBeats = getSnappedLength(newLengthInBeats, timeSignature);
    const snappedWidth = snappedLengthInBeats * beatWidth;
    
    // Adjust position if necessary for start resize to maintain snapped length
    if (resizeEdge === 'start') {
      newLeft = originalLeft + originalWidth - snappedWidth;
    }
    
    // Store the current values in refs (use snapped values)
    currentResizeWidth.current = snappedWidth;
    currentResizeLeft.current = newLeft;
    
    // Update the temporary style for this note
    const newStyle = {
      left: `${newLeft}px`,
      width: `${snappedWidth}px`,
    };
    
    setTempNoteStyles(prev => ({
      ...prev,
      [noteId]: newStyle
    }));
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE RESIZE: noteId=${noteId}, edge=${resizeEdge}, deltaX=${deltaX}, newLeft=${newLeft}, newWidth=${newWidth}`);
    }
  };

  // Handle note resize end
  const handleNoteResizeEnd = (noteId: string, resizeEdge: 'start' | 'end') => {
    if (!activeRegion) return;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE RESIZE END: noteId=${noteId}, edge=${resizeEdge}`);
    }
    
    // Find the note being resized
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Get the beat width
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    
    // Calculate the region's start beat (for absolute positioning)
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    if (currentResizeWidth.current === null || currentResizeLeft.current === null ||
        initialStartBeatRef.current === null || initialEndBeatRef.current === null) {
      // Reset resizing state
      setResizingNoteId(null);
      setTempNoteStyles(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      return;
    }
    
    // Calculate the new start and end beats based on the current position and width
    let newStartBeat, newEndBeat;
    
    if (resizeEdge === 'end') {
      // End resize: only the end beat changes
      newStartBeat = note.getStartBeat(); // Keep the original start beat
      newEndBeat = newStartBeat + (currentResizeWidth.current / beatWidth); // Calculate new end beat
      
      // Ensure minimum note length
      if (newEndBeat - newStartBeat < PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH) {
        newEndBeat = newStartBeat + PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH;
      }
    } else if (resizeEdge === 'start') {
      // Start resize: both start and end beats change
      // Calculate the new start beat (relative to region)
      newStartBeat = (currentResizeLeft.current / beatWidth) - regionStartBeat;
      // Keep the original end beat
      newEndBeat = initialEndBeatRef.current;
      
      // Ensure minimum note length
      if (newEndBeat - newStartBeat < PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH) {
        newStartBeat = newEndBeat - PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH;
      }
    } else {
      // This shouldn't happen, but just in case
      newStartBeat = note.getStartBeat();
      newEndBeat = note.getEndBeat();
    }
    
    // Apply length snapping to the final resize commit
    const originalLength = newEndBeat - newStartBeat;
    const snappedLength = getSnappedLength(originalLength, timeSignature);
    
    // Adjust the note bounds to use the snapped length
    if (resizeEdge === 'end') {
      // For end resize, keep start beat and adjust end beat
      newEndBeat = newStartBeat + snappedLength;
    } else if (resizeEdge === 'start') {
      // For start resize, keep end beat and adjust start beat
      newStartBeat = newEndBeat - snappedLength;
    }
    
    // Note: Delta calculations are now handled inside ResizeNotesCommand
    
    // Determine which notes to resize (capture selection at command creation time)
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(n => n.getId() === item.getId())
    ) as KGMidiNote[];

    // If no notes are selected, just resize the primary note
    // If notes are selected, resize all selected notes (including the primary)
    const noteIdsToResize = selectedNotes.length > 0 
      ? selectedNotes.map(n => n.getId())
      : [noteId];

    // Use command pattern to resize notes with undo support
    try {
      const command = ResizeNotesCommand.fromNoteResize(
        noteId,
        resizeEdge,
        initialStartBeatRef.current,
        initialEndBeatRef.current,
        newStartBeat,
        newEndBeat,
        activeRegion.getId(),
        noteIdsToResize
      );
      
      KGCore.instance().executeCommand(command);
      
      // Update last edited note length
      const noteLength = newEndBeat - newStartBeat;
      KGPianoRollState.instance().setLastEditedNoteLength(noteLength);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Executed ResizeNotesCommand: resized notes using command pattern`);
      }
    } catch (error) {
      console.error('Error resizing notes:', error);
      // Reset resizing state and return early on error
      setResizingNoteId(null);
      setTempNoteStyles(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      currentResizeWidth.current = null;
      currentResizeLeft.current = null;
      initialStartBeatRef.current = null;
      initialEndBeatRef.current = null;
      return;
    }

    const { bar: startBar, beatInBar: startBeatInBar } = beatsToBar(newStartBeat + regionStartBeat, timeSignature);
    const { bar: endBar, beatInBar: endBeatInBar } = beatsToBar(newEndBeat + regionStartBeat, timeSignature);
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Updated note: 
        noteId=${noteId}, resizeEdge=${resizeEdge},
        startBeat=${newStartBeat}, endBeat=${newEndBeat}
        absolute startBeat=${newStartBeat + regionStartBeat}, absolute endBeat=${newEndBeat + regionStartBeat}
        absolute startBar=${startBar + 1}:${(startBeatInBar + 1).toFixed(3)}, absolute endBar=${endBar + 1}:${(endBeatInBar + 1).toFixed(3)}`);
    }
    
    // Reset resizing state
    setResizingNoteId(null);
    setTempNoteStyles(prev => {
      const updated = { ...prev };
      delete updated[noteId];
      return updated;
    });
    currentResizeWidth.current = null;
    currentResizeLeft.current = null;
    initialStartBeatRef.current = null;
    initialEndBeatRef.current = null;
    
    // Increment the note update counter to trigger a re-render
    setNoteUpdateCounter(prev => prev + 1);
    
    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }
  };
  
  // Handle note drag start
  const handleNoteDragStart = (noteId: string, initialX: number, initialY: number) => {
    if (!activeRegion) return;
    
    // Disable dragging in pencil mode
    if (KGPianoRollState.instance().getActiveTool() === 'pencil') {
      return;
    }
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE DRAG START: noteId=${noteId}`);
    }
    
    setDraggingNoteId(noteId);
    
    // Find the note being dragged
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Store the initial pitch
    initialPitchRef.current = note.getPitch();
    
    // Get the beat width and note height
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    
    // Calculate the region's start beat (for absolute positioning)
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    // Calculate the absolute start and end beats
    const absStartBeat = note.getStartBeat() + regionStartBeat;
    
    // Calculate the note's position
    const left = absStartBeat * beatWidth;
    const width = (note.getEndBeat() - note.getStartBeat()) * beatWidth;
    
    // Convert pitch to y position (higher notes have lower y values)
    const pitchIndex = 107 - note.getPitch(); // Reverse the pitch to get the index (B7 is 107)
    const top = pitchIndex * noteHeight;
    
    // Store the initial position
    initialDragLeft.current = left;
    initialDragTop.current = top;
    currentDragLeft.current = left;
    currentDragTop.current = top;
    
    // Set initial style
    const initialStyle = {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${noteHeight}px`,
      zIndex: 100, // Bring to front during drag
    };
    
    setTempNoteStyles(prev => ({
      ...prev,
      [noteId]: initialStyle
    }));
  };
  
  // Handle note drag
  const handleNoteDrag = (noteId: string, deltaX: number, deltaY: number) => {
    if (!activeRegion) return;
    
    // Find the note being dragged
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Get the beat width and note height
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    
    // Get the initial left and top positions
    if (initialDragLeft.current === null || initialDragTop.current === null) return;
    if (currentDragLeft.current === null || currentDragTop.current === null) return;
    
    // Calculate new position
    const originalLeft = initialDragLeft.current;
    const originalTop = initialDragTop.current;

    // Calculate the raw new horizontal position
    const rawNewLeft = originalLeft + deltaX;
    
    // Apply horizontal snapping based on current snap setting
    const regionStartBeat = activeRegion.getStartFromBeat();
    const rawBeatPosition = (rawNewLeft / beatWidth) - regionStartBeat;
    const snappedBeatPosition = getSnappedBeatPosition(rawBeatPosition, timeSignature);
    const snappedLeft = (snappedBeatPosition + regionStartBeat) * beatWidth;
    
    // Use snapped horizontal position, but keep raw vertical position
    const newLeft = snappedLeft;
    const newTop = originalTop + deltaY;

    // Update the current position refs with the new position
    currentDragLeft.current = newLeft;
    currentDragTop.current = newTop;
    
    // Calculate width based on note duration
    const width = (note.getEndBeat() - note.getStartBeat()) * beatWidth;
    
    // Update the temporary style for this note
    const newStyle = {
      left: `${newLeft}px`,
      top: `${newTop}px`,
      width: `${width}px`,
      height: `${noteHeight}px`,
      zIndex: 100, // Keep on top during drag
    };
    
    setTempNoteStyles(prev => ({
      ...prev,
      [noteId]: newStyle
    }));
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE DRAG: noteId=${noteId}, originalLeft=${originalLeft}, originalTop=${originalTop}, deltaX=${deltaX}, deltaY=${deltaY}, newLeft=${newLeft}, newTop=${newTop}`);
    }
  };
  
  // Handle note drag end
  const handleNoteDragEnd = (noteId: string) => {
    if (!activeRegion) return;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE DRAG END: noteId=${noteId}`);
    }
    
    // Find the note being dragged
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    // Get the beat width and note height
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    
    // Calculate the region's start beat (for absolute positioning)
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    if (currentDragLeft.current === null || currentDragTop.current === null || 
        initialDragLeft.current === null || initialDragTop.current === null || 
        initialPitchRef.current === null) {
      // Reset dragging state
      setDraggingNoteId(null);
      setTempNoteStyles(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      return;
    }

    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE DRAG DONE: noteId=${noteId}, finalLeft=${currentDragLeft.current}, finalTop=${currentDragTop.current}`);
    }
    
    // Calculate the new start beat based on the current position (no quantization for horizontal)
    const newStartBeat = (currentDragLeft.current / beatWidth) - regionStartBeat;
    
    // Calculate the new end beat (maintain the same duration)
    const duration = note.getEndBeat() - note.getStartBeat();
    const newEndBeat = newStartBeat + duration;
    
    // Calculate the new pitch based on the current position (quantize to nearest pitch)
    // The piano roll is drawn from bottom to top, with higher notes at the top
    // We need to convert the y position to a pitch
    const pitchIndex = Math.round(currentDragTop.current / noteHeight);
    const newPitch = 107 - pitchIndex; // Convert index back to pitch (B7 is 107)
    
    // Calculate the original start beat for the command
    const originalStartBeat = (initialDragLeft.current / beatWidth) - regionStartBeat;

    // Determine which notes to move (capture selection at command creation time)
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(n => n.getId() === item.getId())
    ) as KGMidiNote[];

    // If no notes are selected, just move the primary note
    // If notes are selected, move all selected notes (including the primary)
    const noteIdsToMove = selectedNotes.some(n => n.getId() === noteId)
      ? selectedNotes.map(n => n.getId())
      : [noteId];

    // Use command pattern to move notes with undo support
    try {
      const command = MoveNotesCommand.fromNoteDrag(
        noteId,
        originalStartBeat,
        initialPitchRef.current,
        newStartBeat,
        newPitch,
        activeRegion.getId(),
        noteIdsToMove
      );
      
      KGCore.instance().executeCommand(command);
      
      // Update last edited note length
      const noteLength = newEndBeat - newStartBeat;
      KGPianoRollState.instance().setLastEditedNoteLength(noteLength);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Executed MoveNotesCommand: moved notes using command pattern`);
      }
    } catch (error) {
      console.error('Error moving notes:', error);
      // Reset dragging state and return early on error
      setDraggingNoteId(null);
      setTempNoteStyles(prev => {
        const updated = { ...prev };
        delete updated[noteId];
        return updated;
      });
      currentDragLeft.current = null;
      currentDragTop.current = null;
      initialDragLeft.current = null;
      initialDragTop.current = null;
      initialPitchRef.current = null;
      return;
    }
    
    const { bar: startBar, beatInBar: startBeatInBar } = beatsToBar(newStartBeat + regionStartBeat, timeSignature);
    const { bar: endBar, beatInBar: endBeatInBar } = beatsToBar(newEndBeat + regionStartBeat, timeSignature);
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Updated note position: 
        noteId=${noteId},
        startBeat=${newStartBeat}, endBeat=${newEndBeat}, pitch=${newPitch}
        absolute startBeat=${newStartBeat + regionStartBeat}, absolute endBeat=${newEndBeat + regionStartBeat}
        absolute startBar=${startBar + 1}:${(startBeatInBar + 1).toFixed(3)}, absolute endBar=${endBar + 1}:${(endBeatInBar + 1).toFixed(3)}
        original pitch=${initialPitchRef.current} (${pitchToNoteNameString(initialPitchRef.current)}), new pitch=${newPitch} (${pitchToNoteNameString(newPitch)})`);
    }
    
    // Reset dragging state
    setDraggingNoteId(null);
    setTempNoteStyles(prev => {
      const updated = { ...prev };
      delete updated[noteId];
      return updated;
    });
    currentDragLeft.current = null;
    currentDragTop.current = null;
    initialDragLeft.current = null;
    initialDragTop.current = null;
    initialPitchRef.current = null;
    
    // Increment the note update counter to trigger a re-render
    setNoteUpdateCounter(prev => prev + 1);
    
    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
      
      // Play note preview if audio interface is ready
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized()) {
        // Try to start audio context if not started yet (user interaction will allow this)
        if (!audioInterface.getIsAudioContextStarted()) {
          audioInterface.startAudioContext().catch(() => {
            // Silently fail if still not allowed - browser policy
          });
        }
        
        // Trigger note if audio context is now started
        if (audioInterface.getIsAudioContextStarted()) {
          audioInterface.triggerNote(track.getId().toString(), note);
        }
      }
    }
  };
  
  return {
    resizingNoteId,
    draggingNoteId,
    tempNoteStyles,
    noteUpdateCounter,
    setNoteUpdateCounter,
    handleGridDoubleClick,
    handleGridClick,
    handleNoteResizeStart,
    handleNoteResize,
    handleNoteResizeEnd,
    handleNoteDragStart,
    handleNoteDrag,
    handleNoteDragEnd,
    deleteSelectedNotes
  };
}; 