import React from 'react';
import { FaUndoAlt } from 'react-icons/fa';
import { LOGIC_REGION_COLOR_SWATCHES } from '../../constants/regionColorPalette';
import './ColorPalettePopup.css';

interface ColorPalettePopupProps {
  selectedColor?: string;
  onSelect: (color: string | null) => void;
  className?: string;
}

const ColorPalettePopup: React.FC<ColorPalettePopupProps> = ({
  selectedColor,
  onSelect,
  className = '',
}) => (
  <div className={`color-palette-popup ${className}`.trim()} role="menu" aria-label="Color palette">
    <button
      type="button"
      className={`color-palette-none${selectedColor === undefined ? ' active' : ''}`}
      onClick={() => onSelect(null)}
      aria-label="Reset color"
      title="Reset color"
    >
      <FaUndoAlt aria-hidden="true" />
    </button>
    <div className="color-palette-grid">
      {LOGIC_REGION_COLOR_SWATCHES.flat().map((color) => (
        <button
          key={color}
          type="button"
          className={`color-palette-swatch${selectedColor === color ? ' active' : ''}`}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
          title={color}
          aria-label={`Select color ${color}`}
        />
      ))}
    </div>
  </div>
);

export default ColorPalettePopup;
