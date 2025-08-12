import React from 'react';
import { FaMousePointer, FaPencilAlt } from 'react-icons/fa';
import { KGDropdown } from '../common';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';

interface PianoRollToolbarProps {
  activeTool: 'pointer' | 'pencil';
  onToolSelect: (tool: 'pointer' | 'pencil') => void;
  quantPosition: string;
  quantLength: string;
  onQuantSelect: (type: 'position' | 'length', value: string) => void;
  snapping: string;
  onSnappingSelect: (value: string) => void;
  blinkButton?: string | null;
}

const PianoRollToolbar: React.FC<PianoRollToolbarProps> = ({
  activeTool,
  onToolSelect,
  quantPosition,
  quantLength,
  onQuantSelect,
  snapping,
  onSnappingSelect,
  blinkButton = null
}) => {
  return (
    <div className="piano-roll-toolbar">
      <div className="toolbar-left">
        {/* Left section - can add more tools later */}
      </div>
      
      <div className="toolbar-center">
        {/* Center section with pointer and pencil tools */}
        <button 
          className={`tool-button ${activeTool === 'pointer' ? 'active' : ''}`}
          onClick={() => onToolSelect('pointer')}
          title="Pointer Tool"
        >
          <FaMousePointer />
        </button>
        <button 
          className={`tool-button ${activeTool === 'pencil' ? 'active' : ''}`}
          onClick={() => onToolSelect('pencil')}
          title="Pencil Tool"
        >
          <FaPencilAlt />
        </button>
      </div>
      
      <div className="toolbar-right">
        {/* Right section with quantization options */}
        <KGDropdown
          options={KGPianoRollState.SNAP_OPTIONS}
          value={snapping}
          onChange={(value) => onSnappingSelect(value)}
          label="Snap"
          buttonClassName="snapping"
          showValueAsLabel={true}
        />
        
        <KGDropdown
          options={KGPianoRollState.QUANT_POS_OPTIONS}
          value={quantPosition}
          onChange={(value) => onQuantSelect('position', value)}
          label="Qua. Pos."
          buttonClassName={`quant-position ${blinkButton === 'quant-position' ? 'button-blink' : ''}`}
        />
        
        <KGDropdown
          options={KGPianoRollState.QUANT_LEN_OPTIONS}
          value={quantLength}
          onChange={(value) => onQuantSelect('length', value)}
          label="Qua. Len."
          buttonClassName={`quant-length ${blinkButton === 'quant-length' ? 'button-blink' : ''}`}
        />
      </div>
    </div>
  );
};

export default PianoRollToolbar; 