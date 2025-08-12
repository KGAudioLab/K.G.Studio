import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface PianoRollHeaderProps {
  onClose: () => void;
  title: string;
  onTitleClick: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

const PianoRollHeader: React.FC<PianoRollHeaderProps> = ({
  onClose,
  title,
  onTitleClick,
  onMouseDown
}) => {
  return (
    <div 
      className="piano-roll-header"
      onMouseDown={onMouseDown}
    >
      <button 
        className="close-button"
        onClick={onClose}
      >
        <FaTimes />
      </button>
      <div 
        className="piano-roll-title"
        onClick={onTitleClick}
        title="Click to rename region"
      >
        {title}
      </div>
    </div>
  );
};

export default PianoRollHeader; 