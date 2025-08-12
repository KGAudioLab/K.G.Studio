import React, { useState } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { useProjectStore } from '../../stores/projectStore';
import TrackInfoItem from './TrackInfoItem';

interface TrackInfoPanelProps {
  tracks: KGTrack[];
  onTrackClick?: () => void;
  onTrackNameEdit: (track: KGTrack, newName: string) => void;
  onTracksReordered: (fromIndex: number, toIndex: number) => void;
}

const TrackInfoPanel: React.FC<TrackInfoPanelProps> = ({
  tracks,
  onTrackClick,
  onTrackNameEdit,
  onTracksReordered
}) => {
  const { setSelectedTrack } = useProjectStore();
  
  // Drag state for track reordering
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);

  // Handle track drag events
  const handleTrackDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedTrackIndex(index);
    // Set a custom drag image or data if needed
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    
    // Add a class to the dragged element - store a reference to avoid null issues
    const element = e.currentTarget;
    if (element) {
      // Add class immediately instead of using setTimeout
      element.classList.add('dragging');
    }
  };

  const handleTrackDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault(); // Necessary to allow dropping
    
    // Only update if the drag over index has changed
    if (dragOverTrackIndex !== index) {
      setDragOverTrackIndex(index);
    }
    
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTrackDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    if (draggedTrackIndex !== null && dragOverTrackIndex !== null && draggedTrackIndex !== dragOverTrackIndex) {
      // Notify parent component about the reordering
      onTracksReordered(draggedTrackIndex, dragOverTrackIndex);
      
      // Select the track that was moved (it's now at the dragOverTrackIndex position)
      const movedTrack = tracks[draggedTrackIndex];
      if (movedTrack) {
        setSelectedTrack(movedTrack.getId().toString());
      }
    }
    
    // Reset drag state
    setDraggedTrackIndex(null);
    setDragOverTrackIndex(null);
    
    // Remove the dragging class from all elements
    document.querySelectorAll('.track-info.dragging').forEach(el => {
      el.classList.remove('dragging');
    });
  };

  const handleTrackDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Reset drag state
    setDraggedTrackIndex(null);
    setDragOverTrackIndex(null);
    
    // Remove the dragging class
    if (e.currentTarget) {
      e.currentTarget.classList.remove('dragging');
    }
  };

  return (
    <div className="info-container">
      {tracks.map((track, index) => (
        <TrackInfoItem
          key={track.getId()}
          track={track}
          index={index}
          isDragging={draggedTrackIndex === index}
          isDragOver={dragOverTrackIndex === index}
          onTrackClick={onTrackClick}
          onTrackNameEdit={onTrackNameEdit}
          onDragStart={handleTrackDragStart}
          onDragOver={handleTrackDragOver}
          onDrop={handleTrackDrop}
          onDragEnd={handleTrackDragEnd}
        />
      ))}
    </div>
  );
};

export default TrackInfoPanel; 