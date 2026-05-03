import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { DEBUG_MODE } from '../../constants';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGTrack } from '../../core/track/KGTrack';
import { KGCore } from '../../core/KGCore';
import { useProjectStore } from '../../stores/projectStore';
import PianoNote from './PianoNote';
import PianoKeys from './PianoKeys';
import PianoGridHeader from './PianoGridHeader';
import PianoGrid from './PianoGrid';
import { useNoteOperations } from '../../hooks/useNoteOperations';
import { useNoteSelection } from '../../hooks/useNoteSelection';
import type { KeySignature } from '../../core/KGProject';
import type { KGAudioRegion } from '../../core/region/KGAudioRegion';

interface PianoRollContentProps {
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  pianoGridRef: React.MutableRefObject<HTMLDivElement | null>;
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  activeRegion: KGMidiRegion | null;
  updateTrack: (track: KGTrack) => void;
  tracks: KGTrack[];
  onSetNoteUpdateTrigger?: (setNoteFn: React.Dispatch<React.SetStateAction<number>>) => void;
  onSetDeleteNotesTrigger?: (deleteFn: () => boolean) => void;
  selectedMode: string;
  keySignature: KeySignature;
  chordGuide: string;
  mode?: 'midi-edit' | 'spectrogram' | 'hybrid';
  audioRegion?: KGAudioRegion;
  trackId?: string;
  projectName?: string;
  bpm?: number;
  spectrogramThresholdDb?: number;
  spectrogramPower?: number;
  pianoRollZoom?: number;
}

const PianoRollContent: React.FC<PianoRollContentProps> = ({
  contentRef,
  pianoGridRef,
  maxBars,
  timeSignature,
  activeRegion,
  updateTrack,
  tracks,
  onSetNoteUpdateTrigger,
  onSetDeleteNotesTrigger,
  selectedMode,
  keySignature,
  chordGuide,
  mode = 'midi-edit',
  audioRegion,
  trackId,
  projectName,
  bpm = 120,
  spectrogramThresholdDb = -25,
  spectrogramPower = 0.5,
  pianoRollZoom = 1,
}) => {
  const isSpectrogram = mode === 'spectrogram';
  const [spectrogramLoading, setSpectrogramLoading] = useState(false);
  const handleSpectrogramLoadingChange = useCallback((loading: boolean) => {
    setSpectrogramLoading(loading);
  }, []);

  // Get KGCore instance
  const core = KGCore.instance();

  // Recording state
  const isRecording = useProjectStore(s => s.isRecording);
  const recordingNotes = useProjectStore(s => s.recordingNotes);

  // Use the note operations hook for resize and drag functionality
  const {
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
  } = useNoteOperations({
    activeRegion,
    timeSignature,
    updateTrack,
    tracks,
    pianoGridRef
  });
  
  // Expose setNoteUpdateCounter to parent component
  useEffect(() => {
    if (onSetNoteUpdateTrigger) {
      onSetNoteUpdateTrigger(setNoteUpdateCounter);
    }
  }, [onSetNoteUpdateTrigger, setNoteUpdateCounter]);

  // Expose deleteSelectedNotes to parent component
  useEffect(() => {
    if (onSetDeleteNotesTrigger) {
      onSetDeleteNotesTrigger(deleteSelectedNotes);
    }
  }, [onSetDeleteNotesTrigger, deleteSelectedNotes]);
  
  // Use the note selection hook for selection functionality
  const {
    selectedNoteIds,
    isBoxSelectingRef,
    selectionBoxRef,
    selectionBoxRender,
    handleNoteClick,
    handleBackgroundClick,
    handleBackgroundMouseDown,
    cleanupSelectionListeners
  } = useNoteSelection({
    activeRegion,
    updateTrack,
    tracks
  });

  // Combined click handler for both pointer and pencil modes
  const handleCombinedClick = (e: React.MouseEvent) => {
    if (isSpectrogram) return;
    handleBackgroundClick(e);
    handleGridClick(e);
  };

  // Sync selected notes with KGCore on mount and when selection changes
  useEffect(() => {
    if (!activeRegion) return;
    
    // Get currently selected items from KGCore
    const selectedItems = core.getSelectedItems();
    
    // Filter for KGMidiNote items that belong to this region
    const selectedNotes = selectedItems.filter(item => 
      item instanceof KGMidiNote && 
      activeRegion.getNotes().some(note => note.getId() === item.getId())
    ) as KGMidiNote[];
    
    // Make sure the note objects have the correct selection state
    activeRegion.getNotes().forEach(note => {
      const isSelected = selectedNotes.some(selectedNote => selectedNote.getId() === note.getId());
      if (isSelected && !note.isSelected()) {
        note.select();
      } else if (!isSelected && note.isSelected()) {
        note.deselect();
      }
    });
  }, [activeRegion]);

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      cleanupSelectionListeners();
    };
  }, []);

  // Memoize the notes rendering to prevent unnecessary recalculations
  const memoizedNotes = useMemo(() => {
    if (isSpectrogram || !activeRegion) return null;
    
    if (DEBUG_MODE.PIANO_ROLL) {
      console.log(`Rendering notes for region: ${activeRegion.getId()}`);
      console.log(`Number of notes: ${activeRegion.getNotes().length}`);
      console.log(`Note update counter: ${noteUpdateCounter}`);
      console.log(`Selected notes: ${Array.from(selectedNoteIds).join(', ')}`);
    }
    
    const notes = activeRegion.getNotes();
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    const regionStartBeat = activeRegion.getStartFromBeat();
    
    return notes.map((note, index) => {
      // Calculate position and size
      const startBeat = note.getStartBeat() + regionStartBeat; // Absolute beat position
      const endBeat = note.getEndBeat() + regionStartBeat; // Absolute beat position
      const pitch = note.getPitch();
      
      // Convert pitch to y position (higher notes have lower y values)
      // We need to find the index of the pitch in our piano roll
      const pitchIndex = 107 - pitch; // Reverse the pitch to get the index (B7 is 107)
      
      // Calculate position and dimensions
      const left = startBeat * beatWidth;
      const top = pitchIndex * noteHeight;
      const width = (endBeat - startBeat) * beatWidth;
      
      const noteId = note.getId();
      
      // Check if this note is being resized or dragged and has a temporary style
      if ((resizingNoteId === noteId || draggingNoteId === noteId) && tempNoteStyles[noteId]) {
        // Use the temporary style for position and size
        const tempStyle = tempNoteStyles[noteId];
        
        return (
          <PianoNote
            key={`note-${noteId}`}
            id={noteId}
            index={index}
            left={parseFloat(tempStyle.left as string)}
            top={parseFloat(tempStyle.top as string)}
            width={parseFloat(tempStyle.width as string)}
            height={noteHeight}
            velocity={note.getVelocity()}
            onResizeStart={handleNoteResizeStart}
            onResize={handleNoteResize}
            onResizeEnd={handleNoteResizeEnd}
            onDragStart={handleNoteDragStart}
            onDrag={handleNoteDrag}
            onDragEnd={handleNoteDragEnd}
            onClick={handleNoteClick}
          />
        );
      }

      return (
        <PianoNote
          key={`note-${noteId}`}
          id={noteId}
          index={index}
          left={left}
          top={top}
          width={width}
          height={noteHeight}
          velocity={note.getVelocity()}
          onResizeStart={handleNoteResizeStart}
          onResize={handleNoteResize}
          onResizeEnd={handleNoteResizeEnd}
          onDragStart={handleNoteDragStart}
          onDrag={handleNoteDrag}
          onDragEnd={handleNoteDragEnd}
          onClick={handleNoteClick}
        />
      );
    });
  }, [mode, activeRegion, noteUpdateCounter, resizingNoteId, draggingNoteId, tempNoteStyles, selectedNoteIds, selectionBoxRender, tracks]);

  const recordingNoteOverlays = useMemo(() => {
    if (!isRecording || !activeRegion || recordingNotes.length === 0) return null;
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    return recordingNotes.map((note, index) => (
      <div
        key={`recording-note-${index}`}
        className="piano-grid-recording-note"
        style={{
          left: note.startBeat * beatWidth,
          top: (107 - note.pitch) * noteHeight,
          width: Math.max((note.endBeat - note.startBeat) * beatWidth, 4),
          height: noteHeight,
        }}
      />
    ));
  }, [isRecording, recordingNotes, activeRegion]);

  return (
    <div className="piano-roll-content-outer">
      <div
        className="piano-roll-content"
        ref={contentRef}
      >
        <PianoGridHeader maxBars={maxBars} timeSignature={timeSignature} />

        <div className="piano-roll-body">
          <PianoKeys activeRegion={activeRegion} />

          <PianoGrid
            gridRef={pianoGridRef}
            onDoubleClick={isSpectrogram ? () => {} : handleGridDoubleClick}
            onClick={isSpectrogram ? () => {} : handleCombinedClick}
            onMouseDown={isSpectrogram ? () => {} : handleBackgroundMouseDown}
            isBoxSelecting={isSpectrogram ? false : isBoxSelectingRef.current}
            selectionBox={isSpectrogram ? { startX: 0, startY: 0, endX: 0, endY: 0 } : selectionBoxRef.current}
            regionStartBeat={activeRegion?.getStartFromBeat() || 0}
            selectedMode={selectedMode}
            keySignature={keySignature}
            chordGuide={chordGuide}
            audioRegion={audioRegion}
            trackId={trackId}
            projectName={projectName}
            bpm={bpm}
            spectrogramThresholdDb={spectrogramThresholdDb}
            spectrogramPower={spectrogramPower}
            pianoRollZoom={pianoRollZoom}
            onSpectrogramLoadingChange={handleSpectrogramLoadingChange}
          >
            {memoizedNotes}
            {!isSpectrogram && recordingNoteOverlays}
          </PianoGrid>
        </div>
      </div>
      {spectrogramLoading && (
        <div className="spectrogram-loading-overlay">
          <div className="spectrogram-loading-label">
            Computing spectrogram…
          </div>
        </div>
      )}
    </div>
  );
};

export default PianoRollContent; 