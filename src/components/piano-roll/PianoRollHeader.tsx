import React from 'react';
import { FaTimes } from 'react-icons/fa';

interface PianoRollHeaderProps {
  onClose: () => void;
  title: string;
  isEditingTitle: boolean;
  titleInputValue: string;
  onTitleClick: () => void;
  onTitleInputChange: (value: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
}

const PianoRollHeader: React.FC<PianoRollHeaderProps> = ({
  onClose,
  title,
  isEditingTitle,
  titleInputValue,
  onTitleClick,
  onTitleInputChange,
  onTitleCommit,
  onTitleCancel,
  onMouseDown,
  titleInputRef
}) => {
  return (
    <div 
      className="piano-roll-header"
      onMouseDown={onMouseDown}
    >
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          className="piano-roll-title-input"
          type="text"
          value={titleInputValue}
          onChange={(e) => onTitleInputChange(e.target.value.replace(/\r?\n/g, ' '))}
          onBlur={onTitleCommit}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              onTitleCommit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              onTitleCancel();
            }
          }}
        />
      ) : (
        <div 
          className="piano-roll-title"
          onClick={onTitleClick}
          title="Click to rename region"
        >
          {title}
        </div>
      )}
      <button 
        className="close-button"
        onClick={onClose}
      >
        <FaTimes />
      </button>
    </div>
  );
};

export default PianoRollHeader; 
