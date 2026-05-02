import React from 'react';
import { FaMousePointer, FaPencilAlt } from 'react-icons/fa';
import { KGDropdown } from '../common';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { KGCore } from '../../core/KGCore';

const POWER_OPTIONS = [
  { label: 'Linear', value: '1.0' },
  { label: '√ (default)', value: '0.5' },
  { label: 'Mild', value: '0.4' },
  { label: 'Strong', value: '0.3' },
];

interface PianoRollToolbarProps {
  activeTool: 'pointer' | 'pencil';
  onToolSelect: (tool: 'pointer' | 'pencil') => void;
  quantPosition: string;
  quantLength: string;
  onQuantSelect: (type: 'position' | 'length', value: string) => void;
  snapping: string;
  onSnappingSelect: (value: string) => void;
  selectedMode: string;
  onModeChange: (value: string) => void;
  chordGuide: string;
  onChordGuideChange: (value: string) => void;
  blinkButton?: string | null;
  mode?: 'midi-edit' | 'spectrogram' | 'hybrid';
  thresholdDb?: number;
  onThresholdChange?: (db: number) => void;
  power?: number;
  onPowerChange?: (power: number) => void;
  zoom: number;
  onZoomChange: (value: number) => void;
}

const PianoRollToolbar: React.FC<PianoRollToolbarProps> = ({
  activeTool,
  onToolSelect,
  quantPosition,
  quantLength,
  onQuantSelect,
  snapping,
  onSnappingSelect,
  selectedMode,
  onModeChange,
  chordGuide,
  onChordGuideChange,
  blinkButton = null,
  mode = 'midi-edit',
  thresholdDb = -25,
  onThresholdChange,
  power = 0.5,
  onPowerChange,
  zoom,
  onZoomChange,
}) => {
  const isSpectrogram = mode === 'spectrogram';
  const showMidiControls = mode !== 'spectrogram';   // midi-edit and hybrid
  const showSpecControls = mode === 'spectrogram' || mode === 'hybrid';

  const [showZoomSlider, setShowZoomSlider] = React.useState(false);
  const zoomSliderRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showZoomSlider) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomSliderRef.current && !zoomSliderRef.current.contains(e.target as Node)) {
        setShowZoomSlider(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomSlider]);

  return (
    <div className="piano-roll-toolbar">
      {showMidiControls && (
        <div className="toolbar-left">
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
          <KGDropdown
            options={Object.entries(KGCore.FUNCTIONAL_CHORDS_DATA).map(([id, data]) => ({ label: data.name, value: id }))}
            value={selectedMode}
            onChange={(value) => onModeChange(value)}
            label="Mode"
            buttonClassName="mode-dropdown"
            showValueAsLabel={true}
          />
          <KGDropdown
            options={[
              { label: 'Guide: Disabled', value: 'N' },
              { label: 'Chord Guide: T', value: 'T' },
              { label: 'Chord Guide: S', value: 'S' },
              { label: 'Chord Guide: D', value: 'D' }
            ]}
            value={chordGuide}
            onChange={(value) => onChordGuideChange(value)}
            label="Chord"
            buttonClassName="chord-guide-dropdown"
            showValueAsLabel={true}
          />
        </div>
      )}

      <div className="toolbar-right">
        {showMidiControls && (
          <>
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
          </>
        )}

        {showSpecControls && (
          <div className="spectrogram-toolbar-controls">
            <span className="spectrogram-control-label">Floor</span>
            <input
              type="range"
              className="spectrogram-threshold-slider"
              min={-50}
              max={-5}
              step={1}
              value={thresholdDb}
              onChange={e => onThresholdChange?.(parseInt(e.target.value))}
              title={`Noise floor: ${thresholdDb} dB`}
            />
            <span className="spectrogram-threshold-value">{thresholdDb} dB</span>
            <KGDropdown
              options={POWER_OPTIONS}
              value={power.toString()}
              onChange={v => onPowerChange?.(parseFloat(v))}
              label="Curve"
              buttonClassName="curve-dropdown"
              showValueAsLabel={true}
            />
          </div>
        )}

        <div className="quant-dropdown-container" ref={zoomSliderRef}>
          <button
            className="quant-button"
            onClick={() => setShowZoomSlider(!showZoomSlider)}
            title="Zoom"
          >
            {zoom}x
          </button>
          {showZoomSlider && (
            <div className="piano-roll-zoom-popup">
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={zoom}
                onChange={(e) => onZoomChange(parseInt(e.target.value))}
              />
              <span className="piano-roll-zoom-value">{zoom}x</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PianoRollToolbar;
