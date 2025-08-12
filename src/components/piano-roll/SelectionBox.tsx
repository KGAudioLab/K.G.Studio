import React from 'react';

interface SelectionBoxProps {
  isSelecting: boolean;
  selectionBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
}

const SelectionBox: React.FC<SelectionBoxProps> = ({ isSelecting, selectionBox }) => {
  if (!isSelecting) return null;
  
  // Calculate the normalized coordinates (top-left to bottom-right)
  const { startX, startY, endX, endY } = selectionBox;
  const left = Math.min(startX, endX);
  const top = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);
  
  return (
    <div
      className="selection-box"
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        border: '1px solid white',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        pointerEvents: 'none', // Allow clicks to pass through
        zIndex: 50
      }}
    />
  );
};

export default SelectionBox; 