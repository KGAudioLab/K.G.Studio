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
import { velocityToColor } from '../../util/velocityColor';
import type { SpectrogramHeightResolution } from '../../util/spectrogramUtil';
import PianoRollAutomationLane from './PianoRollAutomationLane';
import type { PianoRollAutomationType } from './pianoRollAutomation';
import type { SheetMeasureMetric, SheetQuantization } from './sheetNotationTypes';
import type { InstrumentType } from '../../core/track/KGMidiTrack';
import SheetMusicView from './SheetMusicView';

const NOOP_SHEET_METRICS_CHANGE = (_metrics: SheetMeasureMetric[]) => {};

interface PianoRollContentProps {
  contentRef: React.MutableRefObject<HTMLDivElement | null>;
  noteScrollRef: React.MutableRefObject<HTMLDivElement | null>;
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
  mode?: 'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid';
  audioRegion?: KGAudioRegion;
  trackId?: string;
  projectName?: string;
  bpm?: number;
  spectrogramThresholdDb?: number;
  spectrogramPower?: number;
  spectrogramHeightResolution?: SpectrogramHeightResolution;
  pianoRollZoom?: number;
  automationEnabled?: boolean;
  automationType?: PianoRollAutomationType;
  automationRedrawVersion?: number;
  sheetMusicViewEnabled?: boolean;
  sheetMusicTrackScopeEnabled?: boolean;
  sheetQuantization?: SheetQuantization;
  sheetKeySignature?: KeySignature;
  sheetInstrument?: InstrumentType;
  onSheetMeasureMetricsChange?: (metrics: SheetMeasureMetric[]) => void;
  overlayMessage?: string | null;
  overlayProgressPercent?: number | null;
}

const PianoRollContent: React.FC<PianoRollContentProps> = ({
  contentRef,
  noteScrollRef,
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
  spectrogramHeightResolution = 3,
  pianoRollZoom = 1,
  automationEnabled = false,
  automationType = 'pitch-bend',
  automationRedrawVersion = 0,
  sheetMusicViewEnabled = false,
  sheetMusicTrackScopeEnabled = false,
  sheetQuantization,
  sheetKeySignature = 'C major',
  sheetInstrument = 'acoustic_grand_piano',
  onSheetMeasureMetricsChange,
  overlayMessage = null,
  overlayProgressPercent = null,
}) => {
  const isAudioView = mode === 'audio-waveform' || mode === 'spectrogram';
  const isSpectrogram = mode === 'spectrogram';
  const showAutomationLane = automationEnabled && !isAudioView && !sheetMusicViewEnabled;
  const [spectrogramLoading, setSpectrogramLoading] = useState(false);
  const [noteScrollLeft, setNoteScrollLeft] = useState(0);
  const handleSpectrogramLoadingChange = useCallback((loading: boolean) => {
    setSpectrogramLoading(loading);
  }, []);

  // Get KGCore instance
  const core = KGCore.instance();

  // Recording state
  const isRecording = useProjectStore(s => s.isRecording);
  const recordingNotes = useProjectStore(s => s.recordingNotes);
  const forwardAutomationHorizontalWheel = useCallback((delta: number) => {
    const container = noteScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollLeft += delta;
    setNoteScrollLeft(container.scrollLeft);
  }, [noteScrollRef]);

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
    if (isAudioView) return;
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
    if (isAudioView || sheetMusicViewEnabled || !activeRegion) return null;
    
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
      
      // Use preview geometry whenever this note has an active temporary style.
      if (tempNoteStyles[noteId]) {
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
  }, [isAudioView, activeRegion, noteUpdateCounter, resizingNoteId, draggingNoteId, tempNoteStyles, selectedNoteIds, selectionBoxRender, tracks, sheetMusicViewEnabled]);

  const recordingNoteOverlays = useMemo(() => {
    if (!isRecording || !activeRegion || recordingNotes.length === 0) return null;
    const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
    const noteHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-height')) || 20;
    const regionStartBeat = activeRegion.getStartFromBeat();
    return recordingNotes.map((note, index) => (
      <div
        key={`recording-note-${index}`}
        className="piano-grid-recording-note"
        style={{
          left: (note.startBeat + regionStartBeat) * beatWidth,
          top: (107 - note.pitch) * noteHeight,
          width: Math.max((note.endBeat - note.startBeat) * beatWidth, 4),
          height: noteHeight,
          backgroundColor: velocityToColor(note.velocity, 0.35),
          borderColor: velocityToColor(note.velocity, 0.85),
        }}
      />
    ));
  }, [isRecording, recordingNotes, activeRegion]);

  useEffect(() => {
    if (!sheetMusicViewEnabled) {
      return;
    }

    const container = noteScrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = 0;
  }, [noteScrollRef, sheetMusicViewEnabled]);

  const effectiveOverlayMessage = overlayMessage ?? (spectrogramLoading ? 'Computing spectrogram…' : null);

  return (
    <div className="piano-roll-content-outer">
      <div
        className="piano-roll-content"
        ref={contentRef}
        data-testid={showAutomationLane ? 'piano-roll-content-split' : 'piano-roll-content-single'}
      >
        <div className={`piano-roll-main-section ${showAutomationLane ? 'with-automation' : ''}`}>
          <div
            className="piano-roll-note-scroll"
            ref={noteScrollRef}
            onScroll={(event) => setNoteScrollLeft(event.currentTarget.scrollLeft)}
          >
            {!sheetMusicViewEnabled && (
              <PianoGridHeader
                maxBars={maxBars}
                timeSignature={timeSignature}
                hasPianoKeys={mode !== 'audio-waveform'}
              />
            )}
            <div className={`piano-roll-body ${sheetMusicViewEnabled ? 'sheet-music-body' : ''} ${mode === 'audio-waveform' ? 'audio-waveform-body' : ''}`}>
              {!sheetMusicViewEnabled && mode !== 'audio-waveform' && <PianoKeys activeRegion={activeRegion} />}
              {sheetMusicViewEnabled && activeRegion && sheetQuantization ? (
                <SheetMusicView
                  activeRegion={activeRegion}
                  midiRegions={tracks.filter(track => track.getId().toString() === activeRegion?.getTrackId()).flatMap(track => (
                    track.getRegions().filter(region => region instanceof KGMidiRegion)
                  )) as KGMidiRegion[]}
                  maxBars={maxBars}
                  sheetMusicTrackScopeEnabled={sheetMusicTrackScopeEnabled}
                  timeSignature={timeSignature}
                  keySignature={sheetKeySignature}
                  instrument={sheetInstrument}
                  quantization={sheetQuantization}
                  onMetricsChange={onSheetMeasureMetricsChange ?? NOOP_SHEET_METRICS_CHANGE}
                />
              ) : (
                <PianoGrid
                  gridRef={pianoGridRef}
                  onDoubleClick={isSpectrogram ? () => {} : handleGridDoubleClick}
                  onClick={isAudioView ? () => {} : handleCombinedClick}
                  onMouseDown={isAudioView ? () => {} : handleBackgroundMouseDown}
                  isBoxSelecting={isAudioView ? false : isBoxSelectingRef.current}
                  selectionBox={isAudioView ? { startX: 0, startY: 0, endX: 0, endY: 0 } : selectionBoxRef.current}
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
                  spectrogramHeightResolution={spectrogramHeightResolution}
                  pianoRollZoom={pianoRollZoom}
                  mode={mode}
                  onSpectrogramLoadingChange={handleSpectrogramLoadingChange}
                >
                  {memoizedNotes}
                  {!isAudioView && recordingNoteOverlays}
                </PianoGrid>
              )}
            </div>
          </div>
        </div>
        {showAutomationLane && (
          <div className="piano-roll-automation-section">
            <PianoRollAutomationLane
              activeRegion={activeRegion}
              automationType={automationType}
              maxBars={maxBars}
              timeSignature={timeSignature}
              bpm={bpm}
              redrawVersion={automationRedrawVersion}
              horizontalScrollLeft={noteScrollLeft}
              onHorizontalWheel={forwardAutomationHorizontalWheel}
            />
          </div>
        )}
      </div>
      {effectiveOverlayMessage && (
        <div className="spectrogram-loading-overlay">
          <div className="spectrogram-loading-label">
            {effectiveOverlayMessage}
            {overlayProgressPercent !== null && (
              <div className="piano-roll-progress-block">
                <div
                  className="piano-roll-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.max(0, Math.min(100, overlayProgressPercent))}
                >
                  <div
                    className="piano-roll-progress-fill"
                    style={{ width: `${Math.max(0, Math.min(100, overlayProgressPercent))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PianoRollContent; 
