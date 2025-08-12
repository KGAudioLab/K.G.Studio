import React from 'react';
import { useProjectStore } from '../stores/projectStore';

const TrackControl: React.FC = () => {
  const { addTrack } = useProjectStore();

  const handleAddTrack = () => {
    addTrack();
  };

  return (
    <div className="track-control">
      <button onClick={handleAddTrack}>+ Add track</button>
    </div>
  );
};

export default TrackControl; 