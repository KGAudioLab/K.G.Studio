import { useState, useRef } from 'react';
import { DEBUG_MODE, PIANO_ROLL_CONSTANTS } from '../constants';
import { KGMidiRegion } from '../core/region/KGMidiRegion';
import { KGMidiNote } from '../core/midi/KGMidiNote';
import { KGTrack } from '../core/track/KGTrack';
import { KGCore } from '../core/KGCore';
import { KGPianoRollState } from '../core/state/KGPianoRollState';
import { useProjectStore } from '../stores/projectStore';

interface UseNoteSelectionProps {
  activeRegion: KGMidiRegion | null;
  updateTrack: (track: KGTrack) => void;
  tracks: KGTrack[];
}

export const useNoteSelection = ({
  activeRegion,
  updateTrack,
  tracks
}: UseNoteSelectionProps) => {
  // Get store actions
  const { clearAllSelections } = useProjectStore();
  
  // State for note selection
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  
  // Use refs for box selection to avoid async state update issues
  const isBoxSelectingRef = useRef<boolean>(false);
  const selectionBoxRef = useRef<{ startX: number, startY: number, endX: number, endY: number }>({
    startX: 0, startY: 0, endX: 0, endY: 0
  });
  
  // We still need a state for the selection box to trigger re-renders
  const [selectionBoxRender, setSelectionBoxRender] = useState<number>(0);
  
  // Flag to prevent deselection after box selection
  const preventDeselectRef = useRef<boolean>(false);
  
  // Track shift key state for box selection
  const isShiftKeyPressedRef = useRef<boolean>(false);
  
  // Get KGCore instance
  const core = KGCore.instance();
  
  // Handle note click for selection
  const handleNoteClick = (noteId: string, e: React.MouseEvent) => {
    if (!activeRegion) return;
    
    // Disable note selection in pencil mode
    if (KGPianoRollState.instance().getActiveTool() === 'pencil') {
      return;
    }
    
    // Find the note
    const note = activeRegion.getNotes().find(n => n.getId() === noteId);
    if (!note) return;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`NOTE CLICKED: noteId=${noteId}, shift key: ${e.shiftKey}`);
    }
    
    // Create a new Set for selected note IDs
    let newSelectedNoteIds: Set<string>;
    
    // Check if shift key is pressed for multi-selection
    if (e.shiftKey) {
      // Shift key pressed - add/remove to existing selection
      newSelectedNoteIds = new Set(selectedNoteIds);
      
      if (newSelectedNoteIds.has(noteId)) {
        // Deselect the note
        newSelectedNoteIds.delete(noteId);
        
        // Update the note's selection state
        note.deselect();
        
        // Remove from KGCore selection
        core.removeSelectedItem(note);
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Deselected note: ${noteId}`);
        }
      } else {
        // Add to selection
        newSelectedNoteIds.add(noteId);
        
        // Update the note's selection state
        note.select();
        
        // Add to KGCore selection
        core.addSelectedItem(note);
        
        // Update last edited note length
        const noteLength = note.getEndBeat() - note.getStartBeat();
        KGPianoRollState.instance().setLastEditedNoteLength(noteLength);
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Added note to selection: ${noteId}`);
        }
      }
    } else {
      // Shift key not pressed - replace selection
      
      // First deselect all currently selected notes
      activeRegion.getNotes().forEach(n => {
        if (n.isSelected()) {
          n.deselect();
        }
      });
      
      // Clear KGCore selection using store method
      clearAllSelections();
      
      // Create new selection with only this note
      newSelectedNoteIds = new Set([noteId]);
      
      // Select the note
      note.select();
      
      // Add to KGCore selection
      core.addSelectedItem(note);
      
      // Update last edited note length
      const noteLength = note.getEndBeat() - note.getStartBeat();
      KGPianoRollState.instance().setLastEditedNoteLength(noteLength);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Selected note (replacing previous selection): ${noteId}`);
      }
    }
    
    // Update selection state
    setSelectedNoteIds(newSelectedNoteIds);
    
    // Update the track to persist the selection state
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }
  };
  
  // Handle click on piano grid (background) to start box selection or deselect all notes
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Only handle direct clicks on the piano grid, not on notes
    if (e.target === e.currentTarget) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Piano grid background clicked');
      }
      
      // Check if we should prevent deselection (right after box selection)
      if (preventDeselectRef.current) {
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log('Preventing deselection after box selection');
        }
        preventDeselectRef.current = false;
        return;
      }
      
      // If we're not starting a box selection, deselect all notes
      if (!isBoxSelectingRef.current) {
        if (activeRegion) {
          // Deselect all notes in the region
          activeRegion.getNotes().forEach(note => {
            note.deselect();
          });
          
          // Update the track to persist the selection state
          const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
          if (track) {
            updateTrack(track);
          }
        }
        
        // Clear local selection
        setSelectedNoteIds(new Set());
        
        // Clear KGCore selection using store method
        clearAllSelections();
      }
    }
  };

  // Handle mouse down on piano grid for box selection
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    // Only handle direct clicks on the piano grid, not on notes
    if (e.target === e.currentTarget) {
      // Disable box selection in pencil mode
      if (KGPianoRollState.instance().getActiveTool() === 'pencil') {
        return;
      }
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Starting box selection');
      }
      
      // Store shift key state for box selection
      isShiftKeyPressedRef.current = e.shiftKey;
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Box selection with shift key: ${isShiftKeyPressedRef.current}`);
      }
      
      // Get the grid element's bounding rectangle
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect) return;
      
      // Calculate relative position within the grid
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      
      // Initialize selection box using ref for immediate update
      selectionBoxRef.current = {
        startX,
        startY,
        endX: startX,
        endY: startY
      };
      
      // Set box selection mode
      isBoxSelectingRef.current = true;
      
      // Force a re-render to show the initial selection box
      setSelectionBoxRender(prev => prev + 1);
      
      // Add global event listeners for mouse move and up
      document.addEventListener('mousemove', handleBoxSelectionMouseMove);
      document.addEventListener('mouseup', handleBoxSelectionMouseUp);
    }
  };
  
  // Handle mouse move during box selection
  const handleBoxSelectionMouseMove = (e: MouseEvent) => {
    if (!isBoxSelectingRef.current) return;
    
    // Get the grid element's bounding rectangle
    const gridElement = document.querySelector('.piano-grid');
    if (!gridElement) return;
    
    const rect = gridElement.getBoundingClientRect();
    
    // Calculate relative position within the grid
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    // Update selection box using ref for immediate update
    selectionBoxRef.current = {
      ...selectionBoxRef.current,
      endX,
      endY
    };
    
    // Force a re-render to update the selection box
    setSelectionBoxRender(prev => prev + 1);
  };
  
  // Handle mouse up to end box selection
  const handleBoxSelectionMouseUp = (e: MouseEvent) => {
    if (!isBoxSelectingRef.current || !activeRegion) return;
    
    // Calculate the normalized coordinates (top-left to bottom-right)
    const { startX, startY, endX, endY } = selectionBoxRef.current;
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const right = Math.max(startX, endX);
    const bottom = Math.max(startY, endY);

    const mouseReleaseX = endX;
    const mouseReleaseY = endY;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log('Box selection ended');
      console.log(`Selection box coordinates: left=${left}, top=${top}, right=${right}, bottom=${bottom}`);
      console.log(`Width: ${right - left}, Height: ${bottom - top}`);
      console.log(`Shift key was pressed: ${isShiftKeyPressedRef.current}`);
    }
    
    // Check if this is a click (very small box) or an actual selection
    const isClick = (right - left < PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD) && (bottom - top < PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD);
    
    // Only proceed with selection if this is not just a click
    if (!isClick) {
      // Get all notes in the region
      const notes = activeRegion.getNotes();
      
      // Create a new set for selected note IDs
      let newSelectedNoteIds: Set<string>;
      
      // If shift key is pressed, start with current selection
      if (isShiftKeyPressedRef.current) {
        newSelectedNoteIds = new Set(selectedNoteIds);
      } else {
        // If shift key is not pressed, deselect all notes first
        notes.forEach(note => {
          note.deselect();
        });
        
        // Clear KGCore selection using store method
        clearAllSelections();
        
        // Start with empty selection
        newSelectedNoteIds = new Set<string>();
      }
      
      // Get the beat width and note height for position calculations
      const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
      const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
      const regionStartBeat = activeRegion.getStartFromBeat();
      
      // Track notes that are in the box selection
      const notesInBox = new Set<string>();
      
      // Track notes with their distances to mouse release position for finding closest
      const notesWithDistances: { note: KGMidiNote, distance: number }[] = [];
      
      // Check each note to see if any part of it is inside the selection box
      notes.forEach(note => {
        // Calculate position and size
        const startBeat = note.getStartBeat() + regionStartBeat; // Absolute beat position
        const endBeat = note.getEndBeat() + regionStartBeat; // Absolute beat position
        const pitch = note.getPitch();
        
        // Convert pitch to y position (higher notes have lower y values)
        const pitchIndex = 107 - pitch; // Reverse the pitch to get the index (B7 is 107)
        
        // Calculate position and dimensions of the note
        const noteLeft = startBeat * beatWidth;
        const noteTop = pitchIndex * noteHeight;
        const noteRight = endBeat * beatWidth;
        const noteBottom = noteTop + noteHeight;
        
        // Check if any part of the note is inside the selection box
        // This checks if any of the corners or edges of the note are inside the box
        const isIntersecting = !(
          noteRight < left || // Note is completely to the left of the box
          noteLeft > right || // Note is completely to the right of the box
          noteBottom < top || // Note is completely above the box
          noteTop > bottom    // Note is completely below the box
        );
        
        if (isIntersecting) {
          // Add to the set of notes in the box
          notesInBox.add(note.getId());
          
          // Calculate distance from mouse release position to note center
          const noteCenterX = (noteLeft + noteRight) / 2;
          const noteCenterY = (noteTop + noteBottom) / 2;
          const distance = Math.sqrt(
            Math.pow(mouseReleaseX - noteCenterX, 2) + 
            Math.pow(mouseReleaseY - noteCenterY, 2)
          );
          notesWithDistances.push({ note, distance });
          
          if (isShiftKeyPressedRef.current) {
            // If shift is pressed, toggle the selection
            if (newSelectedNoteIds.has(note.getId())) {
              // Deselect the note
              newSelectedNoteIds.delete(note.getId());
              note.deselect();
              core.removeSelectedItem(note);
              
              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Deselected note by shift+box selection: ${note.getId()}`);
              }
            } else {
              // Select the note
              newSelectedNoteIds.add(note.getId());
              note.select();
              core.addSelectedItem(note);
              
              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Selected note by shift+box selection: ${note.getId()}`);
              }
            }
          } else {
            // Regular box selection - always select
            newSelectedNoteIds.add(note.getId());
            note.select();
            core.addSelectedItem(note);
            
            if (DEBUG_MODE.PIANO_ROLL) {
              console.log(`Selected note by box selection: ${note.getId()}`);
            }
          }
        } else if (!isShiftKeyPressedRef.current) {
          // For non-shift selection, make sure notes outside the box are deselected
          note.deselect();
        }
      });
      
      // Update selection state
      setSelectedNoteIds(newSelectedNoteIds);
      
      // Find the closest note to mouse release position and update last edited note length
      if (notesWithDistances.length > 0) {
        const closestNote = notesWithDistances.reduce((closest, current) => 
          current.distance < closest.distance ? current : closest
        ).note;
        
        const noteLength = closestNote.getEndBeat() - closestNote.getStartBeat();
        KGPianoRollState.instance().setLastEditedNoteLength(noteLength);
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Updated last edited note length to ${noteLength} from closest note: ${closestNote.getId()}`);
        }
      }
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Selected ${newSelectedNoteIds.size} notes with box selection`);
      }
      
      // Update the track to persist the selection state
      const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
      if (track) {
        updateTrack(track);
      }
      
      // Set the flag to prevent immediate deselection
      preventDeselectRef.current = true;
    }
    
    // End box selection
    isBoxSelectingRef.current = false;
    
    // Force a re-render to hide the selection box
    setSelectionBoxRender(prev => prev + 1);
    
    // Remove global event listeners
    document.removeEventListener('mousemove', handleBoxSelectionMouseMove);
    document.removeEventListener('mouseup', handleBoxSelectionMouseUp);
  };
  
  // Clean up function to remove event listeners
  const cleanupSelectionListeners = () => {
    document.removeEventListener('mousemove', handleBoxSelectionMouseMove);
    document.removeEventListener('mouseup', handleBoxSelectionMouseUp);
  };
  
  return {
    selectedNoteIds,
    isBoxSelectingRef,
    selectionBoxRef,
    selectionBoxRender,
    handleNoteClick,
    handleBackgroundClick,
    handleBackgroundMouseDown,
    cleanupSelectionListeners
  };
}; 