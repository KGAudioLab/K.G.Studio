import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { FaGripLines } from 'react-icons/fa';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { DEBUG_MODE, PIANO_ROLL_CONSTANTS } from '../../constants';
import PianoRollHeader from './PianoRollHeader';
import PianoRollToolbar from './PianoRollToolbar';
import PianoRollContent from './PianoRollContent';
import { KGCore } from '../../core/KGCore';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { ConfigManager } from '../../core/config/ConfigManager';
import { beatsToBar } from '../../util/midiUtil';
import { UpdateRegionCommand } from '../../core/commands';
import { getSuitableChords, noteNameToPitchClass } from '../../util/scaleUtil';

interface PianoRollProps {
  onClose: () => void;
  regionId: string | null;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
}

const PianoRoll: React.FC<PianoRollProps> = ({
  onClose,
  regionId,
  initialPosition,
  initialSize
}) => {
  const { maxBars, tracks, updateTrack, timeSignature, showChatBox, showInstrumentSelection, keySignature, selectedMode, setSelectedMode } = useProjectStore();
  
  // Tool state for piano roll
  const [activeTool, setActiveTool] = useState<'pointer' | 'pencil'>('pointer');
  
  // Quantization state
  const [quantPosition, setQuantPosition] = useState<string>('1/8');
  const [quantLength, setQuantLength] = useState<string>('1/8');

  // Snapping state
  const [snapping, setSnapping] = useState<string>('NO SNAP');

  // Chord guide state
  const [chordGuide, setChordGuide] = useState<string>('N');

  // Piano roll state with temporary initial values
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  
  // Blink effect state for toolbar button feedback
  const [blinkButton, setBlinkButton] = useState<string | null>(null);
  const [size, setSize] = useState(initialSize || { width: 800, height: PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [activeRegion, setActiveRegion] = useState<KGMidiRegion | null>(null);
  const pianoRollRef = useRef<HTMLDivElement>(null);
  const pianoRollContentRef = useRef<HTMLDivElement>(null);
  const pianoGridRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef<boolean>(false);
  
  // Ref for storing the setNoteUpdateCounter function
  const triggerNoteUpdateRef = useRef<React.Dispatch<React.SetStateAction<number>> | null>(null);
  
  // Ref for storing the deleteSelectedNotes function
  const deleteSelectedNotesRef = useRef<(() => boolean) | null>(null);

  // Calculate initial position and size once on mount
  useEffect(() => {
    // Skip if initialPosition or initialSize were provided as props
    if (!initialPosition || !initialSize) {
      // Calculate initial position based on window dimensions
      const calculateInitialPosition = () => {
        // Dynamically get heights from CSS computed styles
        const statusBarElement = document.querySelector('.status-bar');
        const trackControlElement = document.querySelector('.track-control');
        
        // Get actual heights from DOM elements, or use fallback values if elements don't exist yet
        const statusBarHeight = statusBarElement ? statusBarElement.clientHeight : 30;
        const trackControlHeight = trackControlElement ? trackControlElement.clientHeight : 30;
        const pianoRollHeight = PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT;
        
        // Compute left offset when instrument selection panel is open
        const rootStyles = getComputedStyle(document.documentElement);
        const instrumentPanelWidthStr = rootStyles.getPropertyValue('--instrument-selection-width') || '300px';
        const instrumentPanelWidth = parseInt(instrumentPanelWidthStr, 10) || 300;
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Positioning piano roll with heights - statusBar: ${statusBarHeight}px, trackControl: ${trackControlHeight}px, pianoRoll: ${pianoRollHeight}px`);
        }
        
        return {
          x: showInstrumentSelection ? instrumentPanelWidth : 0,
          y: window.innerHeight - statusBarHeight - trackControlHeight - pianoRollHeight
        };
      };
      
      const calculateInitialSize = () => {
        const rootStyles = getComputedStyle(document.documentElement);
        const chatBoxWidthStr = rootStyles.getPropertyValue('--chat-box-width') || '350px';
        const instrumentPanelWidthStr = rootStyles.getPropertyValue('--instrument-selection-width') || '300px';
        const chatBoxWidth = parseInt(chatBoxWidthStr, 10) || 350;
        const instrumentPanelWidth = parseInt(instrumentPanelWidthStr, 10) || 300;
        
        let availableWidth = window.innerWidth;
        if (showChatBox) availableWidth -= chatBoxWidth;
        if (showInstrumentSelection) availableWidth -= instrumentPanelWidth;
        
        // Ensure a sensible minimum starting width
        const clampedWidth = Math.max(400, availableWidth);
        
        return {
          width: clampedWidth,
          height: PIANO_ROLL_CONSTANTS.PIANO_ROLL_HEIGHT
        };
      };
      
      // Set position and size only if not provided as props
      if (!initialPosition) {
        setPosition(calculateInitialPosition());
      }
      
      if (!initialSize) {
        setSize(calculateInitialSize());
      }
    }
    // Intentionally run once on mount to capture layout at open time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs once on mount

  // Find and set the active region when regionId changes
  useEffect(() => {
    if (!regionId) {
      setActiveRegion(null);
      return;
    }
    
    // Find the region in the tracks
    for (const track of tracks) {
      const regions = track.getRegions();
      const region = regions.find(r => r.getId() === regionId);
      
      if (region && region instanceof KGMidiRegion) {
        setActiveRegion(region);
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Active region set in PianoRoll: ${region.getId()}`);
          console.log(`Region details: name=${region.getName()}, trackId=${region.getTrackId()}, trackIndex=${region.getTrackIndex()}`);
        }
        
        break;
      }
    }
  }, [regionId, tracks]);

  // Sync local state with KGPianoRollState on mount
  useEffect(() => {
    const pianoRollState = KGPianoRollState.instance();
    
    // Sync snapping state
    const currentSnap = pianoRollState.getCurrentSnap();
    setSnapping(currentSnap);
    
    // Sync tool state
    const currentTool = pianoRollState.getActiveTool() as 'pointer' | 'pencil';
    setActiveTool(currentTool);
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Synced piano roll state on mount - snap: ${currentSnap}, tool: ${currentTool}`);
    }
  }, []); // Empty dependency array means this runs once on mount

  // Add keyboard event listener for Escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Close on Escape key
      if (event.key === 'Escape') {
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log('Closing piano roll with ESC key');
        }
        onClose();
      }
    };
    
    // Add event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Handle mouse events for dragging and resizing
  const handleMouseDown = (e: React.MouseEvent, action: 'drag' | 'resize') => {
    if (action === 'drag') {
      setIsDragging(true);
      wasDraggingRef.current = false; // Reset the dragging flag
      if (pianoRollRef.current) {
        const rect = pianoRollRef.current.getBoundingClientRect();
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    } else if (action === 'resize') {
      setIsResizing(true);
      e.preventDefault();
    }
  };
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Set the flag to true as soon as any movement happens
        wasDraggingRef.current = true;
        
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y
        });
      } else if (isResizing) {
        setSize({
          width: Math.max(400, e.clientX - position.x),
          height: Math.max(300, e.clientY - position.y)
        });
      }
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      // We keep wasDraggingRef.current as is - it will be used in handleTitleClick
      // and reset on the next mousedown
    };
    
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove as unknown as EventListener);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove as unknown as EventListener);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, position]);
  
  // Handle title click to rename the region
  const handleTitleClick = () => {
    // If we were just dragging, don't show the rename dialog
    if (wasDraggingRef.current) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log("Skipping rename dialog because the window was just dragged");
      }
      return;
    }
    
    if (!activeRegion) return;
    
    // Show a prompt to get the new name
    const newName = window.prompt("Enter a new name for the region:", activeRegion.getName());
    
    // If the user clicked Cancel or entered an empty string, do nothing
    if (!newName || newName.trim() === '' || newName === activeRegion.getName()) return;
    
    // Use command pattern to update the region name with undo support
    try {
      const command = new UpdateRegionCommand(activeRegion.getId(), { name: newName.trim() });
      KGCore.instance().executeCommand(command);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Executed UpdateRegionCommand: renamed region ${activeRegion.getId()} to "${newName}" using command pattern`);
      }
      
      // Update the store to trigger re-render
      const updatedTracks = [...tracks];
      useProjectStore.setState({ tracks: updatedTracks });
      
    } catch (error) {
      console.error('Error renaming region:', error);
      // Optionally show user-friendly error message
      alert('Failed to rename region. Please try again.');
    }
  };

  // Handle tool selection
  const handleToolSelect = (tool: 'pointer' | 'pencil') => {
    setActiveTool(tool);
    KGPianoRollState.instance().setActiveTool(tool);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected tool: ${tool}`);
    }
  };
  
  // Handle snapping selection
  const handleSnappingSelect = useCallback((value: string) => {
    setSnapping(value);
    KGPianoRollState.instance().setCurrentSnap(value);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected snapping: ${value}`);
    }
  }, []);

  // Handle mode selection
  const handleModeSelect = useCallback((value: string) => {
    setSelectedMode(value);
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Selected mode: ${value}`);
    }
  }, [setSelectedMode]);

  // Handle chord guide selection
  const handleChordGuideSelect = useCallback((value: string) => {
    setChordGuide(value);
  }, []);

  // Update suitable chords whenever chord guide, key signature, or mode changes
  useEffect(() => {
    const pianoRollState = KGPianoRollState.instance();

    if (chordGuide === 'N') {
      // Disabled - clear chord data
      pianoRollState.setCurrentSuitableChords({});
      pianoRollState.setCurrentSuitableChordsPitchClasses({});

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Chord guide disabled - cleared suitable chords`);
      }
    } else {
      // Get suitable chords for the selected function (T/S/D)
      const functionType = chordGuide as 'T' | 'S' | 'D';
      const suitableChords = getSuitableChords(keySignature, selectedMode, functionType);

      // Convert note names to pitch classes (ensuring ascending order)
      const chordsPitchClasses: Record<string, number[]> = {};
      for (const [chordSymbol, noteNames] of Object.entries(suitableChords)) {
        const pitchClasses: number[] = [];
        let previousPitch = -1;

        for (const noteName of noteNames) {
          let pitchClass = noteNameToPitchClass(noteName);

          // If this pitch is lower than the previous one, add an octave
          if (previousPitch >= 0 && pitchClass <= previousPitch) {
            pitchClass += 12;
          }

          pitchClasses.push(pitchClass);
          previousPitch = pitchClass;
        }

        chordsPitchClasses[chordSymbol] = pitchClasses;
      }

      // Update piano roll state
      pianoRollState.setCurrentSuitableChords(suitableChords);
      pianoRollState.setCurrentSuitableChordsPitchClasses(chordsPitchClasses);

      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Chord guide updated: ${chordGuide} (${functionType})`);
        console.log(`Suitable chords for ${keySignature} in ${selectedMode} mode:`, suitableChords);
        console.log(`Pitch classes:`, chordsPitchClasses);
      }
    }
  }, [chordGuide, keySignature, selectedMode]);

  // Handler for receiving the setNoteUpdateCounter function from PianoRollContent
  const handleSetNoteUpdateTrigger = (setNoteFn: React.Dispatch<React.SetStateAction<number>>) => {
    triggerNoteUpdateRef.current = setNoteFn;
  };

  // Handler for receiving the deleteSelectedNotes function from PianoRollContent
  const handleSetDeleteNotesTrigger = (deleteFn: () => boolean) => {
    deleteSelectedNotesRef.current = deleteFn;
  };
  
  // Quantize selected notes based on the selected quantization value
  const quantizeSelectedNotes = useCallback((quantValue: string) => {
    if (!activeRegion) return;
    
    // Get the KGCore instance
    const core = KGCore.instance();
    
    // Get all selected notes
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];
    
    if (selectedNotes.length === 0) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('No notes selected for quantization');
      }
      return;
    }
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Quantizing ${selectedNotes.length} selected notes with value: ${quantValue}`);
    }
    
    // Parse the quantization value (e.g., "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(quantValue.split('/')[1]);
    if (isNaN(denominator)) {
      console.error(`Invalid quantization value: ${quantValue}`);
      return;
    }
    
    // Calculate the quantization step in beats
    // In a 4/4 time signature, a quarter note (1/4) is 1 beat
    // In a 6/8 time signature, an eighth note (1/8) is 1 beat
    const { numerator, denominator: timeSigDenominator } = timeSignature;
    
    // Calculate beats per whole note based on time signature
    // In 4/4, a whole note is 4 beats
    // In 6/8, a whole note is 6 beats (because each beat is an eighth note)
    const beatsPerWholeNote = numerator * (4 / timeSigDenominator);
    
    // Calculate the quantization step in beats
    // quantizationStep should ALWAYS be 4 / denominator regardless of time signature
    const quantizationStep = 4 / denominator;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Time signature: ${numerator}/${timeSigDenominator}`);
      console.log(`Beats per whole note: ${beatsPerWholeNote}`);
      console.log(`Quantization step: ${quantizationStep} beats`);
    }
    
    // Apply quantization to each selected note
    selectedNotes.forEach(note => {
      // Get the current start beat
      const currentStartBeat = note.getStartBeat();
      
      // Calculate the quantized start beat
      const quantizedStartBeat = Math.round(currentStartBeat / quantizationStep) * quantizationStep;
      
      // Calculate the duration of the note
      const duration = note.getEndBeat() - currentStartBeat;
      
      // Set the new start beat and maintain the duration
      note.setStartBeat(quantizedStartBeat);
      note.setEndBeat(quantizedStartBeat + duration);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Quantized note ${note.getId()}: ${currentStartBeat} -> ${quantizedStartBeat}`);
      }
    });
    
    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }
    
    // Trigger a re-render by incrementing the note update counter
    if (triggerNoteUpdateRef.current) {
      triggerNoteUpdateRef.current(prev => prev + 1);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Triggered note update to re-render quantized notes');
      }
    }
  }, [activeRegion, timeSignature, updateTrack, tracks]);
  
  // Quantize selected notes length based on the selected quantization value
  const quantizeNoteLength = useCallback((quantValue: string) => {
    if (!activeRegion) return;
    
    // Get the KGCore instance
    const core = KGCore.instance();
    
    // Get all selected notes
    const selectedItems = core.getSelectedItems();
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];
    
    if (selectedNotes.length === 0) {
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('No notes selected for length quantization');
      }
      return;
    }
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Quantizing length of ${selectedNotes.length} selected notes with value: ${quantValue}`);
    }
    
    // Parse the quantization value (e.g., "1/1", "1/2", "1/4", "1/8", "1/16", "1/32")
    const denominator = parseInt(quantValue.split('/')[1]);
    if (isNaN(denominator)) {
      console.error(`Invalid quantization value: ${quantValue}`);
      return;
    }
    
    // Calculate the quantization step in beats
    // In a 4/4 time signature, a quarter note (1/4) is 1 beat
    // In a 6/8 time signature, an eighth note (1/8) is 1 beat
    const { numerator, denominator: timeSigDenominator } = timeSignature;
    
    // Calculate beats per whole note based on time signature
    // In 4/4, a whole note is 4 beats
    // In 6/8, a whole note is 6 beats (because each beat is an eighth note)
    const beatsPerWholeNote = numerator * (4 / timeSigDenominator);
    
    // Calculate the quantization step in beats
    // quantizationStep should ALWAYS be 4 / denominator regardless of time signature
    const quantizationStep = 4 / denominator;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Time signature: ${numerator}/${timeSigDenominator}`);
      console.log(`Beats per whole note: ${beatsPerWholeNote}`);
      console.log(`Length quantization step: ${quantizationStep} beats`);
    }
    
    // Apply quantization to each selected note
    selectedNotes.forEach(note => {
      // Get the current start and end beats
      const startBeat = note.getStartBeat();
      const currentEndBeat = note.getEndBeat();
      
      // Calculate the current duration
      const currentDuration = currentEndBeat - startBeat;
      
      // Calculate the quantized duration
      // If the current duration is less than the quantization step,
      // extend it to match the quantization step exactly
      // Otherwise, round to the nearest multiple of quantizationStep
      let quantizedDuration;
      
      if (currentDuration < quantizationStep) {
        // For notes shorter than the quantization step, extend to exactly one step
        quantizedDuration = quantizationStep;
        
        if (DEBUG_MODE.PIANO_ROLL) {
          console.log(`Extending short note ${note.getId()} from ${currentDuration} to ${quantizedDuration}`);
        }
      } else {
        // For longer notes, round to nearest multiple of quantizationStep
        quantizedDuration = Math.round(currentDuration / quantizationStep) * quantizationStep;
      }
      
      // Ensure minimum note length
      quantizedDuration = Math.max(PIANO_ROLL_CONSTANTS.MIN_NOTE_LENGTH, quantizedDuration);
      
      // Set the new end beat while maintaining the start beat
      note.setEndBeat(startBeat + quantizedDuration);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Quantized note length ${note.getId()}: ${currentDuration} -> ${quantizedDuration}`);
      }
    });
    
    // Find the track that contains this region and update it
    const track = tracks.find(t => t.getId().toString() === activeRegion.getTrackId());
    if (track) {
      updateTrack(track);
    }
    
    // Trigger a re-render by incrementing the note update counter
    if (triggerNoteUpdateRef.current) {
      triggerNoteUpdateRef.current(prev => prev + 1);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log('Triggered note update to re-render quantized note lengths');
      }
    }
  }, [activeRegion, timeSignature, updateTrack, tracks]);

  // Handle quantization selection
  const handleQuantSelect = useCallback((type: 'position' | 'length', value: string) => {
    if (type === 'position') {
      setQuantPosition(value);
      
      // Apply quantization immediately when position quantization is changed
      quantizeSelectedNotes(value);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`quant-position selected: ${value}`);
      }
    } else {
      setQuantLength(value);
      
      // Apply length quantization immediately when length quantization is changed
      quantizeNoteLength(value);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`quant-length selected: ${value}`);
      }
    }
  }, [quantizeSelectedNotes, quantizeNoteLength]);

  // Calculate C4 position and scroll to it when piano roll opens
  useEffect(() => {
    if (pianoRollContentRef.current) {
      // Calculate position of C4
      // We have 8 octaves (0-7), and C4 is in the middle
      // Each octave has 12 notes, each note is piano key height
      // C4 is in octave 4, and C is the first note in each octave
      
      // Calculate from the bottom:
      // - Octaves 0-3 = 4 octaves = 4 * 12 * piano key height
      // - Within octave 4, C is the first note (from bottom), so 0px additional
      const keyHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
      const c4Position = 4 * 12 * keyHeight; // pixels from bottom
      
      // Total height of all notes (8 octaves * 12 notes * piano key height)
      const totalHeight = 8 * 12 * keyHeight;
      
      // Get the viewport height of the piano roll content
      const viewportHeight = pianoRollContentRef.current.clientHeight;
      
      // Calculate scroll position to center C4
      // We need to scroll from the top, so we calculate:
      // (total height - C4 position) - (viewport height / 2)
      const scrollPosition = (totalHeight - c4Position) - (viewportHeight / 2);
      
      // Scroll to the calculated position
      pianoRollContentRef.current.scrollTop = Math.max(0, scrollPosition);
    }
  }, []);

  // Scroll horizontally to the active region's starting bar
  useEffect(() => {
    if (pianoRollContentRef.current && activeRegion) {
      // Get the starting beat of the region
      const startBeat = activeRegion.getStartFromBeat();
      
      // Get the time signature to calculate beats per bar
      const beatsPerBar = timeSignature.numerator;
      
      // Calculate the bar number (0-indexed)
      const barNumber = Math.floor(startBeat / beatsPerBar);
      
      if (DEBUG_MODE.PIANO_ROLL) {
        console.log(`Scrolling to region's starting bar: ${barNumber + 1} (startBeat: ${startBeat}, beatsPerBar: ${beatsPerBar})`);
      }
      
      // Calculate the pixel position (each bar is --region-grid-bar-width wide, which is 160px by default)
      const barWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-bar-width')) || 160;
      
      // Calculate the scroll position to scroll to the starting bar
      const scrollPosition = barNumber * barWidth;
      
      // Scroll to the calculated position
      pianoRollContentRef.current.scrollLeft = Math.max(0, scrollPosition);
    }
  }, [activeRegion, timeSignature]);

  // Add keyboard event listener for piano roll hotkeys (snapping and quantization)
  useEffect(() => {
    const handlePianoRollKeyDown = (event: KeyboardEvent) => {
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

      // Handle delete key for selected notes
      if (event.key === 'Backspace' || event.key === 'Delete') {
        if (deleteSelectedNotesRef.current) {
          const deleted = deleteSelectedNotesRef.current();
          if (deleted) {
            // Prevent default behavior only if notes were actually deleted
            event.preventDefault();
          }
        }
        return;
      }
      
      // Handle piano roll hotkeys
      const configManager = ConfigManager.instance();
      if (configManager.getIsInitialized()) {
        // Chord guide switch hotkey
        const switch_key = configManager.get('hotkeys.piano_roll.switch') as string;
        if (event.key && event.key.toLowerCase() === switch_key.toLowerCase()) {
          // Call the switchChord function exposed by PianoGrid
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const switchChord = (window as any).__pianoGridSwitchChord;
          if (typeof switchChord === 'function') {
            switchChord();
            event.preventDefault();
          }
          return;
        }

        // Snapping hotkeys
        const snap_none_key = configManager.get('hotkeys.piano_roll.snap_none') as string;
        const snap_1_4_key = configManager.get('hotkeys.piano_roll.snap_1_4') as string;
        const snap_1_8_key = configManager.get('hotkeys.piano_roll.snap_1_8') as string;
        const snap_1_16_key = configManager.get('hotkeys.piano_roll.snap_1_16') as string;
        
        // Quantize position hotkeys
        const qua_pos_1_4_key = configManager.get('hotkeys.piano_roll.qua_pos_1_4') as string;
        const qua_pos_1_8_key = configManager.get('hotkeys.piano_roll.qua_pos_1_8') as string;
        const qua_pos_1_16_key = configManager.get('hotkeys.piano_roll.qua_pos_1_16') as string;
        
        // Quantize length hotkeys
        const qua_len_1_4_key = configManager.get('hotkeys.piano_roll.qua_len_1_4') as string;
        const qua_len_1_8_key = configManager.get('hotkeys.piano_roll.qua_len_1_8') as string;
        const qua_len_1_16_key = configManager.get('hotkeys.piano_roll.qua_len_1_16') as string;
        
        let actionType: 'snap' | 'quantize' | null = null;
        let actionValue: string | null = null;
        let quantType: 'position' | 'length' | null = null;
        
        // Check snapping hotkeys
        if (event.key === snap_none_key) {
          actionType = 'snap';
          actionValue = 'NO SNAP';
        } else if (event.key === snap_1_4_key) {
          actionType = 'snap';
          actionValue = '1/4';
        } else if (event.key === snap_1_8_key) {
          actionType = 'snap';
          actionValue = '1/8';
        } else if (event.key === snap_1_16_key) {
          actionType = 'snap';
          actionValue = '1/16';
        }
        // Check quantize position hotkeys
        else if (event.key === qua_pos_1_4_key) {
          actionType = 'quantize';
          actionValue = '1/4';
          quantType = 'position';
        } else if (event.key === qua_pos_1_8_key) {
          actionType = 'quantize';
          actionValue = '1/8';
          quantType = 'position';
        } else if (event.key === qua_pos_1_16_key) {
          actionType = 'quantize';
          actionValue = '1/16';
          quantType = 'position';
        }
        // Check quantize length hotkeys
        else if (event.key === qua_len_1_4_key) {
          actionType = 'quantize';
          actionValue = '1/4';
          quantType = 'length';
        } else if (event.key === qua_len_1_8_key) {
          actionType = 'quantize';
          actionValue = '1/8';
          quantType = 'length';
        } else if (event.key === qua_len_1_16_key) {
          actionType = 'quantize';
          actionValue = '1/16';
          quantType = 'length';
        }
        
        if (actionType && actionValue) {
          // Prevent default behavior
          event.preventDefault();
          
          if (actionType === 'snap') {
            // Validate the snap value exists in snap options
            if (KGPianoRollState.SNAP_OPTIONS.includes(actionValue)) {
              // Change snapping value
              handleSnappingSelect(actionValue);
              
              // Trigger blink effect for visual feedback
              setBlinkButton('snapping');
              setTimeout(() => setBlinkButton(null), 200);
              
              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Snap hotkey triggered: ${event.key} → ${actionValue}`);
              }
            }
          } else if (actionType === 'quantize' && quantType) {
            // Validate the quantValue exists in the appropriate options
            const validOptions = quantType === 'length' ? KGPianoRollState.QUANT_LEN_OPTIONS : KGPianoRollState.QUANT_POS_OPTIONS;
            
            if (validOptions.includes(actionValue)) {
              // Apply quantization
              handleQuantSelect(quantType, actionValue);
              
              // Trigger blink effect for visual feedback
              const buttonName = quantType === 'length' ? 'quant-length' : 'quant-position';
              setBlinkButton(buttonName);
              setTimeout(() => setBlinkButton(null), 200);
              
              if (DEBUG_MODE.PIANO_ROLL) {
                console.log(`Quantize ${quantType} hotkey triggered: ${event.key} → ${actionValue}`);
              }
            }
          }
        }
      }
    };
    
    // Add event listener
    window.addEventListener('keydown', handlePianoRollKeyDown);
    
    // Remove event listener on cleanup
    return () => {
      window.removeEventListener('keydown', handlePianoRollKeyDown);
    };
  }, [handleQuantSelect, handleSnappingSelect]);

  // Get the title for the piano roll based on the active region
  const getPianoRollTitle = () => {
    if (!activeRegion) return "EDIT NOTE CLIP";
    
    // Calculate the bar and beat position of the region
    const startBeat = activeRegion.getStartFromBeat();
    const { bar, beatInBar } = beatsToBar(startBeat, timeSignature);
    
    // Format as 1-indexed bar and beat (bar + 1, beatInBar + 1)
    const barNumber = bar + 1;
    const beatNumber = beatInBar + 1;
    
    return `${activeRegion.getName()} (at ${barNumber}:${beatNumber})`;
  };

  return (
    <div 
      className="piano-roll-panel"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 2000
      }}
      ref={pianoRollRef}
    >
      <PianoRollHeader
        onClose={onClose}
        title={getPianoRollTitle()}
        onTitleClick={handleTitleClick}
        onMouseDown={(e) => handleMouseDown(e, 'drag')}
      />
      
      <PianoRollToolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        quantPosition={quantPosition}
        quantLength={quantLength}
        onQuantSelect={handleQuantSelect}
        snapping={snapping}
        onSnappingSelect={handleSnappingSelect}
        selectedMode={selectedMode}
        onModeChange={handleModeSelect}
        chordGuide={chordGuide}
        onChordGuideChange={handleChordGuideSelect}
        blinkButton={blinkButton}
      />
      
      <PianoRollContent
        contentRef={pianoRollContentRef}
        pianoGridRef={pianoGridRef}
        maxBars={maxBars}
        timeSignature={timeSignature}
        activeRegion={activeRegion}
        updateTrack={updateTrack}
        tracks={tracks}
        onSetNoteUpdateTrigger={handleSetNoteUpdateTrigger}
        onSetDeleteNotesTrigger={handleSetDeleteNotesTrigger}
        selectedMode={selectedMode}
        keySignature={keySignature}
        chordGuide={chordGuide}
      />
      
      <div 
        className="resize-handle"
        onMouseDown={(e) => handleMouseDown(e, 'resize')}
      >
        <FaGripLines />
      </div>
    </div>
  );
};

export default PianoRoll; 