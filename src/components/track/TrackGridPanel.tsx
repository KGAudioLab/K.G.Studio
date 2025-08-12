import React, { useRef } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import TrackGridItem from './TrackGridItem';
import { Playhead } from '../common';
import type { RegionUI } from '../interfaces';
import { DEBUG_MODE } from '../../constants';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { isModifierKeyPressed } from '../../util/osUtil';
import { CreateRegionCommand, ResizeRegionCommand, MoveRegionCommand } from '../../core/commands';
import { KGCore } from '../../core/KGCore';

interface TrackGridPanelProps {
  tracks: KGTrack[];
  regions: RegionUI[];
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  draggedTrackIndex: number | null;
  dragOverTrackIndex: number | null;
  selectedRegionId: string | null;
  onRegionCreated: (trackIndex: number, region: RegionUI, midiRegion: KGMidiRegion) => void;
  onRegionUpdated?: (regionId: string, updates: Partial<RegionUI>, expectedModelUpdates?: { startBeat: number, length: number }) => void;
  onRegionClick?: (regionId: string) => void;
  onOpenPianoRoll?: (regionId: string) => void;
}

const TrackGridPanel: React.FC<TrackGridPanelProps> = ({
  tracks,
  regions,
  maxBars,
  timeSignature,
  draggedTrackIndex,
  dragOverTrackIndex,
  selectedRegionId,
  onRegionCreated,
  onRegionUpdated,
  onRegionClick,
  onOpenPianoRoll
}) => {
  const gridContainerRef = useRef<HTMLDivElement>(null);

  // Utility function to create a region at a specific position
  const createRegionAtPosition = (e: React.MouseEvent<HTMLDivElement>, trackIndex: number) => {
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
    
    if (DEBUG_MODE.TRACK_GRID_PANEL) {
      console.log(`Creating region on track ${trackIndex + 1}, bar ${barNumber}`);
    }
    
    // Get beats per bar from the time signature
    const beatsPerBar = timeSignature.numerator;
    
    // Create and execute the region creation command
    const command = CreateRegionCommand.fromBarCoordinates(
      trackId,
      trackIndex,
      barNumber,
      1, // Default to 1 bar length
      beatsPerBar,
      `${track.getName()} Region`
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
    const newStartBeat = (finalBarNumber - 1) * beatsPerBar;
    const newLengthInBeats = finalLength * beatsPerBar;
    
    // Find the track that contains this region
    const track = tracks.find(t => t.getId().toString() === region.trackId);
    if (!track) return;
    
    // Update the region in the track's model
    const trackRegions = track.getRegions();
    const midiRegion = trackRegions.find(r => r.getId() === regionId) as KGMidiRegion | undefined;
    
    if (midiRegion) {
      const oldStartBeat = midiRegion.getStartFromBeat();
      const oldBarNumber = region.barNumber;
      
      if (DEBUG_MODE.TRACK_GRID_PANEL) {
        console.log(`Updating KGRegion model - Before: startBeat=${oldStartBeat}, length=${midiRegion.getLength()}`);
        console.log(`Bar numbers - old: ${oldBarNumber}, new: ${finalBarNumber}`);
      }
      
      // Use command pattern to update the region position and length (note adjustments handled inside command)
      try {
        const command = ResizeRegionCommand.fromBarCoordinates(
          regionId,
          finalBarNumber,
          finalLength,
          timeSignature
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
    }
    
    // Update the region in the parent component with expected model values
    if (onRegionUpdated) {
      onRegionUpdated(
        regionId, 
        { barNumber: finalBarNumber, length: finalLength },
        { startBeat: newStartBeat, length: newLengthInBeats }
      );
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
        />
      ))}
    </div>
  );
};

export default TrackGridPanel; 