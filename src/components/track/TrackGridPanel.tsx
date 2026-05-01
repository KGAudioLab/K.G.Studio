import React, { useRef, useState } from 'react';
import { KGTrack, TrackType } from '../../core/track/KGTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import TrackGridItem from './TrackGridItem';
import { Playhead, FileImportModal } from '../common';
import type { RegionUI } from '../interfaces';
import { DEBUG_MODE, REGION_CONSTANTS } from '../../constants';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { isModifierKeyPressed } from '../../util/osUtil';
import { CreateRegionCommand, ResizeRegionCommand, MoveRegionCommand, ImportAudioCommand, ImportMidiClipCommand } from '../../core/commands';
import { KGCore } from '../../core/KGCore';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { generateNewRegionName } from '../../util/miscUtil';
import { KGAudioFileStorage } from '../../core/io/KGAudioFileStorage';
import { showAlert } from '../../util/dialogUtil';
import { parseMidiFirstTrackNotes } from '../../util/midiUtil';
import * as Tone from 'tone';

interface TrackGridPanelProps {
  tracks: KGTrack[];
  regions: RegionUI[];
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  draggedTrackIndex: number | null;
  dragOverTrackIndex: number | null;
  selectedRegionId: string | null;
  projectName: string;
  onRegionCreated: (trackIndex: number, region: RegionUI, midiRegion: KGMidiRegion) => void;
  onRegionUpdated?: (regionId: string, updates: Partial<RegionUI>, expectedModelUpdates?: { startBeat: number, length: number }) => void;
  onRegionClick?: (regionId: string) => void;
  onOpenPianoRoll?: (regionId: string) => void;
  onExternalDropComplete?: (trackIndex: number, regionUI: RegionUI) => void;
}

const TrackGridPanel: React.FC<TrackGridPanelProps> = ({
  tracks,
  regions,
  maxBars,
  timeSignature,
  draggedTrackIndex,
  dragOverTrackIndex,
  selectedRegionId,
  projectName,
  onRegionCreated,
  onRegionUpdated,
  onRegionClick,
  onOpenPianoRoll,
  onExternalDropComplete,
}) => {
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [showAudioImportModal, setShowAudioImportModal] = useState(false);
  const pendingAudioImportRef = useRef<{ barNumber: number; trackIndex: number } | null>(null);

  // Utility function to create a region at a specific position
  const createRegionAtPosition = async (e: React.MouseEvent<HTMLDivElement>, trackIndex: number) => {
    // Get the grid container element
    const gridContainer = e.currentTarget.closest('.grid-container');
    if (!gridContainer) return;
    
    // Get the grid container's bounding rectangle
    const gridRect = gridContainer.getBoundingClientRect();
    
    // Calculate the relative X position within the grid
    const relativeX = e.clientX - gridRect.left;
    
    // Calculate the width of each bar
    const barWidth = gridContainer.clientWidth / maxBars;
    
    // Calculate which bar was clicked (0-indexed)
    const barIndex = Math.floor(relativeX / barWidth);
    
    // Add 1 to convert to 1-indexed bar number
    const barNumber = barIndex + 1;
    
    // Get the track and its ID
    const track = tracks[trackIndex];
    const trackId = track.getId().toString();

    // For audio tracks, show the file import modal instead of creating a blank region
    if (track.getType() === TrackType.Wave) {
      const snap = KGMainContentState.instance().isSnappingEnabled();
      const rawBar = relativeX / barWidth + 1;
      const snappedBarNumber = Math.max(1, snap ? Math.round(rawBar) : rawBar);
      pendingAudioImportRef.current = { barNumber: snappedBarNumber, trackIndex };
      setShowAudioImportModal(true);
      return;
    }

    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Creating region on track ${trackIndex + 1}, bar ${barNumber}`);
    }
    
    // Get beats per bar from the time signature
    const beatsPerBar = timeSignature.numerator;
    
    // Check for overlapping regions before creating a new one
    const newRegionStartBeat = (barNumber - 1) * beatsPerBar;
    const newRegionEndBeat = newRegionStartBeat + beatsPerBar - 1;
    
    const existingRegions = track.getRegions();
    const hasOverlap = existingRegions.some(region => {
      const existingStart = region.getStartFromBeat();
      const existingEnd = existingStart + region.getLength() - 1;
      return newRegionStartBeat <= existingEnd && newRegionEndBeat >= existingStart;
    });
    
    if (hasOverlap) {
      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`Cannot create region at bar ${barNumber}: overlaps with existing region`);
      }
      await showAlert('Cannot create region: overlaps with existing region');
      return; // Don't create the region if it overlaps
    }
    
    // Create and execute the region creation command
    const command = CreateRegionCommand.fromBarCoordinates(
      trackId,
      trackIndex,
      barNumber,
      1, // Default to 1 bar length
      beatsPerBar,
      generateNewRegionName(trackId)
    );
    
    KGCore.instance().executeCommand(command);
    
    // Get the created region for the UI callback
    const createdRegion = command.getCreatedRegion();
    if (createdRegion) {
      // Create the region UI object for the parent component
      const newRegionUI: RegionUI = {
        id: createdRegion.getId(),
        trackId: trackId,
        trackIndex,
        barNumber,
        length: 1,
        name: createdRegion.getName()
      };
      
      // Notify parent about the new region (for UI state updates)
      onRegionCreated(trackIndex, newRegionUI, createdRegion);
    }
  };

  // Handle audio file import after the user picks a file from the modal
  const handleAudioFileImport = async (file: File) => {
    setShowAudioImportModal(false);
    const pending = pendingAudioImportRef.current;
    if (!pending) return;
    pendingAudioImportRef.current = null;

    const { barNumber, trackIndex } = pending;
    const track = tracks[trackIndex];
    if (!track) return;

    const beatsPerBar = timeSignature.numerator;
    const fileId = KGAudioFileStorage.generateAudioFileId(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const toneBuffer = new Tone.ToneAudioBuffer();
      await new Promise<void>((resolve, reject) => {
        const audioContext = Tone.getContext().rawContext as AudioContext;
        audioContext.decodeAudioData(
          arrayBuffer.slice(0),
          (decoded) => { toneBuffer.set(decoded); resolve(); },
          (err) => reject(err)
        );
      });

      const audioDurationSeconds = toneBuffer.duration;
      await KGAudioFileStorage.storeAudioFile(projectName, fileId, file);
      KGAudioInterface.instance().loadAudioBufferForTrack(
        track.getId().toString(),
        fileId,
        toneBuffer
      );

      const bpm = KGCore.instance().getCurrentProject().getBpm();
      const durationInBeats = audioDurationSeconds * (bpm / 60);
      const insertBeat = (barNumber - 1) * beatsPerBar;
      const lengthInBars = Math.max(1, Math.ceil(durationInBeats / beatsPerBar));
      const prevMaxBars = maxBars;
      const newMaxBars = Math.max(maxBars, barNumber + lengthInBars - 1);

      const cmd = new ImportAudioCommand(
        track.getId() as unknown as number,
        trackIndex,
        fileId,
        file.name,
        audioDurationSeconds,
        insertBeat,
        durationInBeats,
        prevMaxBars,
        newMaxBars
      );
      KGCore.instance().executeCommand(cmd);

      const created = cmd.getCreatedRegion();
      if (created && onExternalDropComplete) {
        const regionUI: RegionUI = {
          id: created.getId(),
          trackId: track.getId().toString(),
          trackIndex,
          barNumber,
          length: lengthInBars,
          name: created.getName(),
        };
        onExternalDropComplete(trackIndex, regionUI);
      }

      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`[TrackGrid] Imported audio "${file.name}" to track ${trackIndex}, bar ${barNumber}, ${audioDurationSeconds.toFixed(2)}s`);
      }
    } catch (err) {
      console.error('[TrackGrid] Audio import from click failed:', err);
    }
  };

  // Handle double click on track grid to create region
  const handleTrackGridDoubleClick = (e: React.MouseEvent<HTMLDivElement>, trackIndex: number) => {
    // Only allow double-click creation in pointer mode
    if (KGMainContentState.instance().getActiveTool() === 'pencil') {
      return;
    }
    createRegionAtPosition(e, trackIndex);
  };

  // Handle single click on track grid for pencil mode or modifier+click
  const handleTrackGridClick = (e: React.MouseEvent<HTMLDivElement>, trackIndex: number) => {
    // Create region on single click in pencil mode OR when modifier key is pressed
    if (KGMainContentState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(e)) {
      createRegionAtPosition(e, trackIndex);
    }
  };

  // Handle region resize during drag
  const handleRegionResize = (regionId: string, newBarNumber: number, newLength: number) => {
    // This is just for live visual updates, we don't update the model yet
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Resizing region ${regionId} to barNumber ${newBarNumber}, length ${newLength}`);
    }
  };

  // Handle region resize end
  const handleRegionResizeEnd = (regionId: string, finalBarNumber: number, finalLength: number) => {
    // Now we update the model with the final rounded values
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Finished resizing region ${regionId} to barNumber ${finalBarNumber}, length ${finalLength}`);
    }

    // Find the region
    const region = regions.find(r => r.id === regionId);
    if (!region) return;

    // Calculate new start and length in beats
    const beatsPerBar = timeSignature.numerator;
    let clampedBarNumber = finalBarNumber;
    let clampedLength = finalLength;

    // Find the track that contains this region
    const track = tracks.find(t => t.getId().toString() === region.trackId);
    if (!track) return;

    // Update the region in the track's model
    const trackRegions = track.getRegions();
    const coreRegion = trackRegions.find(r => r.getId() === regionId);

    if (coreRegion) {
      const oldStartBeat = coreRegion.getStartFromBeat();
      const oldBarNumber = region.barNumber;

      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`Updating KGRegion model - Before: startBeat=${oldStartBeat}, length=${coreRegion.getLength()}`);
        console.log(`Bar numbers - old: ${oldBarNumber}, new: ${finalBarNumber}`);
      }

      // Clamp audio region resize to audio file boundaries
      let newClipStartOffsetSeconds: number | undefined;
      if (coreRegion instanceof KGAudioRegion) {
        const bpm = KGCore.instance().getCurrentProject().getBpm();
        const secondsPerBeat = 60 / bpm;
        const clipOffset = coreRegion.getClipStartOffsetSeconds();
        const audioDuration = coreRegion.getAudioDurationSeconds();
        const snap = KGMainContentState.instance().isSnappingEnabled();

        // Left edge changed — calculate new clip offset
        if (clampedBarNumber !== oldBarNumber) {
          const newStartBeat = (clampedBarNumber - 1) * beatsPerBar;
          const beatDelta = newStartBeat - oldStartBeat;
          const secondsDelta = beatDelta * secondsPerBeat;
          const unclampedClipOffset = clipOffset + secondsDelta;

          if (unclampedClipOffset < 0) {
            // Dragged past audio start — snap to earliest allowed position
            const maxLeftExtensionBeats = clipOffset / secondsPerBeat;
            const minStartBeat = oldStartBeat - maxLeftExtensionBeats;
            clampedBarNumber = snap
              ? Math.ceil(minStartBeat / beatsPerBar) + 1
              : (minStartBeat / beatsPerBar) + 1;
            const oldEndBarNumber = oldBarNumber + (coreRegion.getLength() / beatsPerBar);
            clampedLength = oldEndBarNumber - clampedBarNumber;
            newClipStartOffsetSeconds = 0;
          } else {
            newClipStartOffsetSeconds = Math.min(unclampedClipOffset, audioDuration);
          }
        }

        // Right edge — clamp length so it doesn't exceed remaining audio
        const effectiveClipOffset = newClipStartOffsetSeconds ?? clipOffset;
        const maxDurationSeconds = audioDuration - effectiveClipOffset;
        const maxLengthBars = (maxDurationSeconds / secondsPerBeat) / beatsPerBar;
        if (clampedLength > maxLengthBars) {
          clampedLength = snap ? Math.floor(maxLengthBars) : maxLengthBars;
          if (clampedLength < REGION_CONSTANTS.MIN_REGION_LENGTH) {
            clampedLength = REGION_CONSTANTS.MIN_REGION_LENGTH;
          }
        }
      }

      const newStartBeat = (clampedBarNumber - 1) * beatsPerBar;
      const newLengthInBeats = clampedLength * beatsPerBar;

      // Use command pattern to update the region position and length (note adjustments handled inside command)
      try {
        const command = ResizeRegionCommand.fromBarCoordinates(
          regionId,
          clampedBarNumber,
          clampedLength,
          timeSignature,
          newClipStartOffsetSeconds
        );

        KGCore.instance().executeCommand(command);

        if (DEBUG_MODE.TRACK_GRID_PANEL) {
          console.log(`Executed ResizeRegionCommand: region ${regionId} resized using command pattern`);

          // Verify the command worked
          const updatedRegion = track.getRegions().find(r => r.getId() === regionId);
          console.log(`Verified region in track: ${updatedRegion ? 'found' : 'not found'}, startBeat=${updatedRegion?.getStartFromBeat()}, length=${updatedRegion?.getLength()}`);
        }
      } catch (error) {
        console.error('Error resizing region:', error);
        return;
      }

      // Update the region in the parent component with expected model values
      if (onRegionUpdated) {
        onRegionUpdated(
          regionId,
          { barNumber: clampedBarNumber, length: clampedLength },
          { startBeat: newStartBeat, length: newLengthInBeats }
        );
      }
    }
  };

  // Handle region drag during movement
  const handleRegionDrag = (regionId: string, newBarNumber: number, trackIndex: number) => {
    // This is just for live visual updates, we don't update the model yet
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Dragging region ${regionId} to barNumber ${newBarNumber}, trackIndex ${trackIndex}`);
    }
    
    // We don't need to update any temporary state in the parent component anymore
    // The region will follow the mouse directly using transform in the TrackGridItem component
  };

  // Handle region drag end
  const handleRegionDragEnd = (regionId: string, finalBarNumber: number, finalTrackIndex: number) => {
    // Now we update the model with the final rounded values
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Finished dragging region ${regionId} to barNumber ${finalBarNumber}, trackIndex ${finalTrackIndex}`);
    }
    
    // Find the region
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Get the target track
    const targetTrack = tracks[finalTrackIndex];
    if (!targetTrack) return;

    // Block cross-type region moves (MIDI <-> Audio)
    const sourceTrack = tracks.find(t => {
      return t.getRegions().some(r => r.getId() === regionId);
    });
    if (sourceTrack && sourceTrack.getType() !== targetTrack.getType()) {
      // Snap back — don't execute the move
      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`Blocked cross-type move: ${sourceTrack.getType()} region cannot move to ${targetTrack.getType()} track`);
      }
      return;
    }

    // Use command pattern to move the region
    try {
      const command = MoveRegionCommand.fromBarCoordinates(
        regionId,
        finalBarNumber,
        targetTrack.getId().toString(),
        finalTrackIndex,
        timeSignature
      );
      
      KGCore.instance().executeCommand(command);

      // Copy audio buffer to target track if this is a cross-track audio region move
      if (sourceTrack && targetTrack && sourceTrack.getId() !== targetTrack.getId()) {
        const coreRegion = targetTrack.getRegions().find(r => r.getId() === regionId);
        if (coreRegion?.getCurrentType() === 'KGAudioRegion') {
          const audioRegion = coreRegion as unknown as KGAudioRegion;
          KGAudioInterface.instance().copyAudioBufferBetweenTracks(
            sourceTrack.getId().toString(),
            targetTrack.getId().toString(),
            audioRegion.getAudioFileId()
          );
        }
      }

      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`Executed MoveRegionCommand: region ${regionId} moved using command pattern`);

        // Verify the command worked
        const movedRegion = command.getTargetRegion();
        console.log(`Verified region: ${movedRegion ? 'found' : 'not found'}, startBeat=${movedRegion?.getStartFromBeat()}, trackId=${movedRegion?.getTrackId()}`);
      }
    } catch (error) {
      console.error('Error moving region:', error);
      return;
    }
    
    // Calculate new start in beats for UI update
    const beatsPerBar = timeSignature.numerator;
    const startBeat = (finalBarNumber - 1) * beatsPerBar;
    
    // Update the region in the parent component with expected model values
    if (onRegionUpdated) {
      // Find the updated region to get its length
      const updatedTrack = tracks[finalTrackIndex];
      const updatedRegions = updatedTrack.getRegions();
      const updatedRegion = updatedRegions.find(r => r.getId() === regionId);
      
      onRegionUpdated(
        regionId, 
        { 
          trackId: targetTrack.getId().toString(), 
          trackIndex: finalTrackIndex, 
          barNumber: finalBarNumber 
        },
        { 
          startBeat, 
          length: updatedRegion ? updatedRegion.getLength() : 0 
        }
      );
    }
  };

  // Handle region click
  const handleRegionClick = (regionId: string) => {
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Region clicked in panel: ${regionId}`);
    }
    
    // Find the region
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    
    // Find the track that contains this region
    const track = tracks.find(t => t.getId().toString() === region.trackId);
    if (!track) return;
    
    // Find the region in the track's model
    const trackRegions = track.getRegions();
    const midiRegion = trackRegions.find(r => r.getId() === regionId) as KGMidiRegion | undefined;
    
    if (midiRegion && DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Found region in model: ${midiRegion.getId()}, trackId=${midiRegion.getTrackId()}, name=${midiRegion.getName()}`);
    }
    
    // Notify parent about the click
    if (onRegionClick) {
      onRegionClick(regionId);
    }
  };

  // Handle external K.G.One clip drop onto a track row
  const handleExternalDrop = async (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    const raw = e.dataTransfer.getData('application/kgone-clip');
    if (!raw) return;

    let dropData: { midiUrl?: string; audioUrl: string; audioDurationSeconds: number; audioFileName: string };
    try {
      dropData = JSON.parse(raw);
    } catch {
      console.error('[KGOne] Invalid drop data');
      return;
    }

    // Calculate drop bar position
    if (!gridContainerRef.current) return;
    const gridRect = gridContainerRef.current.getBoundingClientRect();
    const relativeX = e.clientX - gridRect.left;
    const barWidth = gridContainerRef.current.clientWidth / maxBars;
    const rawBar = relativeX / barWidth + 1;
    const snap = KGMainContentState.instance().isSnappingEnabled();
    const barNumber = Math.max(1, snap ? Math.round(rawBar) : Math.floor(rawBar));

    const track = tracks[trackIndex];
    if (!track) return;

    const beatsPerBar = timeSignature.numerator;

    try {
      if (track.getType() === TrackType.MIDI) {
        if (!dropData.midiUrl) {
          await showAlert(
            'This audio clip can only be imported into an audio track.\n' +
            'Please drag it onto an audio track instead.'
          );
          return;
        }
        // ── MIDI track: fetch MIDI file and create a KGMidiRegion ──────────
        const midiResp = await fetch(dropData.midiUrl);
        if (!midiResp.ok) throw new Error(`MIDI fetch failed (${midiResp.status})`);
        const buf = await midiResp.arrayBuffer();
        const { notes, totalBeats } = parseMidiFirstTrackNotes(new Uint8Array(buf));
        const lengthInBars = Math.max(1, Math.ceil(totalBeats / beatsPerBar));

        const cmd = ImportMidiClipCommand.fromBarCoordinates(
          track.getId().toString(),
          trackIndex,
          barNumber,
          lengthInBars,
          beatsPerBar,
          notes,
          'KGOne Clip'
        );
        KGCore.instance().executeCommand(cmd);

        const created = cmd.getCreatedRegion();
        if (created && onExternalDropComplete) {
          const regionUI: RegionUI = {
            id: created.getId(),
            trackId: track.getId().toString(),
            trackIndex,
            barNumber,
            length: lengthInBars,
            name: created.getName(),
          };
          onExternalDropComplete(trackIndex, regionUI);
        }

        if (DEBUG_MODE.TRACK_GRID_PANEL) {
          console.log(`[KGOne] Imported MIDI clip to track ${trackIndex}, bar ${barNumber}, ${notes.length} notes`);
        }

      } else if (track.getType() === TrackType.Wave) {
        // ── Audio track: save blob to OPFS and create a KGAudioRegion ──────
        const blob = await fetch(dropData.audioUrl).then(r => r.blob());
        const audioFile = new File([blob], dropData.audioFileName, { type: 'audio/wav' });
        const fileId = `kgone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // Decode audio to get accurate duration and load into player bus
        const arrayBuffer = await audioFile.arrayBuffer();
        const toneBuffer = new Tone.ToneAudioBuffer();
        await new Promise<void>((resolve, reject) => {
          const audioContext = Tone.getContext().rawContext as AudioContext;
          audioContext.decodeAudioData(
            arrayBuffer.slice(0),
            (decoded) => { toneBuffer.set(decoded); resolve(); },
            (err) => reject(err)
          );
        });

        const audioDurationSeconds = toneBuffer.duration;

        await KGAudioFileStorage.storeAudioFile(projectName, fileId, audioFile);
        KGAudioInterface.instance().loadAudioBufferForTrack(
          track.getId().toString(),
          fileId,
          toneBuffer
        );

        const bpm = KGCore.instance().getCurrentProject().getBpm();
        const durationInBeats = audioDurationSeconds * (bpm / 60);
        const insertBeat = (barNumber - 1) * beatsPerBar;
        const lengthInBars = Math.max(1, Math.ceil(durationInBeats / beatsPerBar));
        const prevMaxBars = maxBars;
        const newMaxBars = Math.max(maxBars, barNumber + lengthInBars - 1);

        const cmd = new ImportAudioCommand(
          track.getId() as unknown as number,
          trackIndex,
          fileId,
          dropData.audioFileName,
          audioDurationSeconds,
          insertBeat,
          durationInBeats,
          prevMaxBars,
          newMaxBars
        );
        KGCore.instance().executeCommand(cmd);

        const created = cmd.getCreatedRegion();
        if (created && onExternalDropComplete) {
          const regionUI: RegionUI = {
            id: created.getId(),
            trackId: track.getId().toString(),
            trackIndex,
            barNumber,
            length: lengthInBars,
            name: created.getName(),
          };
          onExternalDropComplete(trackIndex, regionUI);
        }

        if (DEBUG_MODE.TRACK_GRID_PANEL) {
          console.log(`[KGOne] Imported audio clip to track ${trackIndex}, bar ${barNumber}, ${audioDurationSeconds.toFixed(2)}s`);
        }
      }
    } catch (err) {
      console.error('[KGOne] Drop import failed:', err);
    }
  };

  return (
    <div className="grid-container" ref={gridContainerRef}>
      {/* Playhead */}
      <Playhead context="main-grid" />

      {/* Track grids */}
      {tracks.map((track, index) => (
        <TrackGridItem
          key={track.getId()}
          track={track}
          index={index}
          isDragging={draggedTrackIndex === index}
          isDragOver={dragOverTrackIndex === index}
          regions={regions}
          maxBars={maxBars}
          selectedRegionId={selectedRegionId}
          gridContainerRef={gridContainerRef}
          onDoubleClick={handleTrackGridDoubleClick}
          onClick={handleTrackGridClick}
          onRegionResize={handleRegionResize}
          onRegionResizeEnd={handleRegionResizeEnd}
          onRegionDrag={handleRegionDrag}
          onRegionDragEnd={handleRegionDragEnd}
          onRegionClick={handleRegionClick}
          onOpenPianoRoll={onOpenPianoRoll}
          allTracks={tracks}
          onKGOneClipDrop={handleExternalDrop}
        />
      ))}

      <FileImportModal
        isVisible={showAudioImportModal}
        onClose={() => setShowAudioImportModal(false)}
        onFileImport={handleAudioFileImport}
        acceptedTypes={['.wav', '.mp3', '.ogg', '.flac', '.aac']}
        title="Import Audio"
        description="Drag and drop your audio file here"
      />
    </div>
  );
};

export default TrackGridPanel; 