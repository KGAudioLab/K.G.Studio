import React from 'react';
import { FaMousePointer, FaPencilAlt } from 'react-icons/fa';
import { TbArrowBarToUp } from 'react-icons/tb';
import { KGDropdown } from '../common';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { KGCore } from '../../core/KGCore';
import {
  PIANO_ROLL_AUTOMATION_OPTIONS,
  type PianoRollAutomationType,
} from './pianoRollAutomation';

const POWER_OPTIONS = [
  { label: 'Linear', value: '1.0' },
  { label: '√ (default)', value: '0.5' },
  { label: 'Mild', value: '0.4' },
  { label: 'Strong', value: '0.3' },
];

const CHORD_GUIDE_BUTTONS: Array<{ label: string; value: 'N' | 'T' | 'S' | 'D'; ariaLabel: string }> = [
  { label: '⊘', value: 'N', ariaLabel: 'Chord guide off' },
  { label: 'T', value: 'T', ariaLabel: 'Chord guide tonic' },
  { label: 'S', value: 'S', ariaLabel: 'Chord guide subdominant' },
  { label: 'D', value: 'D', ariaLabel: 'Chord guide dominant' },
];

interface PianoRollToolbarProps {
  showAudioSpectrogramToggle?: boolean;
  audioSpectrogramEnabled?: boolean;
  onAudioSpectrogramToggle?: () => void;
  sheetMusicToggleDisabled?: boolean;
  sheetMusicViewEnabled?: boolean;
  onSheetMusicViewToggle?: () => void;
  sheetMusicTrackScopeEnabled?: boolean;
  onSheetMusicTrackScopeToggle?: () => void;
  sheetQuantization?: string;
  onSheetQuantizationChange?: (value: string) => void;
  sheetQuantizationOptions?: string[];
  activeTool: 'pointer' | 'pencil';
  onToolSelect: (tool: 'pointer' | 'pencil') => void;
  quantPosition: string;
  quantLength: string;
  onQuantSelect: (type: 'position' | 'length', value: string) => void;
  snapping: string;
  onSnappingSelect: (value: string) => void;
  selectedMode: string;
  onModeChange: (value: string) => void;
  chordGuide: 'N' | 'T' | 'S' | 'D';
  onChordGuideChange: (value: 'N' | 'T' | 'S' | 'D') => void;
  blinkButton?: string | null;
  mode?: 'midi-edit' | 'audio-waveform' | 'spectrogram' | 'hybrid';
  thresholdDb?: number;
  onThresholdChange?: (db: number) => void;
  power?: number;
  onPowerChange?: (power: number) => void;
  zoom: number;
  onZoomChange: (value: number) => void;
  showAutomationControls?: boolean;
  automationEnabled?: boolean;
  automationType?: PianoRollAutomationType;
  onAutomationToggle?: () => void;
  onAutomationTypeChange?: (value: PianoRollAutomationType) => void;
  onDetectChords?: () => void | Promise<void>;
  detectingChords?: boolean;
  onDetectTempo?: () => void | Promise<void>;
  detectingTempo?: boolean;
}

const PianoRollToolbar: React.FC<PianoRollToolbarProps> = ({
  showAudioSpectrogramToggle = false,
  audioSpectrogramEnabled = false,
  onAudioSpectrogramToggle,
  sheetMusicToggleDisabled = false,
  sheetMusicViewEnabled = false,
  onSheetMusicViewToggle,
  sheetMusicTrackScopeEnabled = false,
  onSheetMusicTrackScopeToggle,
  sheetQuantization = '16,48',
  onSheetQuantizationChange,
  sheetQuantizationOptions = [],
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
  showAutomationControls = false,
  automationEnabled = false,
  automationType = 'pitch-bend',
  onAutomationToggle,
  onAutomationTypeChange,
  onDetectChords,
  detectingChords = false,
  onDetectTempo,
  detectingTempo = false,
}) => {
  const showMidiControls = mode !== 'spectrogram' && mode !== 'audio-waveform' && !sheetMusicViewEnabled;
  const showAudioOnlyControls = mode === 'audio-waveform' && !sheetMusicViewEnabled;
  const showSpectrogramOnlyControls = mode === 'spectrogram' && !sheetMusicViewEnabled;
  const showSpecControls = !sheetMusicViewEnabled && (mode === 'spectrogram' || mode === 'hybrid');
  const showSpecMenu = !sheetMusicViewEnabled && (!!onDetectChords || !!onDetectTempo);

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

  const [showMoreMenu, setShowMoreMenu] = React.useState(false);
  const specMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (specMenuRef.current && !specMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const spectrogramToggleButton = showAudioSpectrogramToggle ? (
    <button
      className={`tool-button icon-only sheet-mode-toggle ${audioSpectrogramEnabled ? 'active' : ''}`}
      onClick={() => onAudioSpectrogramToggle?.()}
      title="Spectrogram View"
      aria-label="Spectrogram View"
    >
      <svg className="spectrogram-view-icon" width="12" height="12" viewBox="0 0 10 10" fill="currentColor">
        <rect x="3" y="0.5" width="6.5" height="2.5" rx="0.4" />
        <rect x="1.5" y="3.75" width="6.5" height="2.5" rx="0.4" />
        <rect x="0" y="7" width="6.5" height="2.5" rx="0.4" />
      </svg>
    </button>
  ) : null;

  const sheetMusicToggleButton = (
    <button
      className={`tool-button sheet-mode-toggle ${sheetMusicViewEnabled ? 'active' : ''}`}
      onClick={() => onSheetMusicViewToggle?.()}
      title="Sheet Music View"
      aria-label="Sheet Music View"
      disabled={sheetMusicToggleDisabled}
    >
      ♬
    </button>
  );

  return (
    <div className="piano-roll-toolbar">
      {showMidiControls && (
        <div className="toolbar-left">
          {spectrogramToggleButton}
          {sheetMusicToggleButton}
          <button
            className={`tool-button ${activeTool === 'pointer' ? 'active' : ''}`}
            onClick={() => onToolSelect('pointer')}
            title="Pointer Tool"
          >
            <FaMousePointer className="piano-roll-tool-icon" />
          </button>
          <button
            className={`tool-button ${activeTool === 'pencil' ? 'active' : ''}`}
            onClick={() => onToolSelect('pencil')}
            title="Pencil Tool"
          >
            <FaPencilAlt className="piano-roll-tool-icon" />
          </button>
          {showAutomationControls && (
            <div className="piano-roll-automation-toolbar-group">
              <button
                className={`tool-button automation-toggle-button ${automationEnabled ? 'active' : ''}`}
                onClick={() => onAutomationToggle?.()}
                title="Toggle automation lane"
                aria-label="Toggle automation lane"
              >
                A
              </button>
              <KGDropdown
                options={PIANO_ROLL_AUTOMATION_OPTIONS}
                value={automationType}
                onChange={(value) => onAutomationTypeChange?.(value as PianoRollAutomationType)}
                label="Automation"
                buttonClassName="automation-type-dropdown"
                showValueAsLabel={true}
              />
            </div>
          )}
          <KGDropdown
            options={Object.entries(KGCore.FUNCTIONAL_CHORDS_DATA).map(([id, data]) => ({ label: data.name, value: id }))}
            value={selectedMode}
            onChange={(value) => onModeChange(value)}
            label="Mode"
            buttonClassName="mode-dropdown"
            showValueAsLabel={true}
          />
          <div className="piano-roll-chord-guide-toolbar-group" role="group" aria-label="Chord guide">
            {CHORD_GUIDE_BUTTONS.map((button, index) => (
              <button
                key={button.value}
                type="button"
                className={`tool-button automation-toggle-button chord-guide-toggle-button chord-guide-toggle-button-${index} ${chordGuide === button.value ? 'active' : ''}`}
                onClick={() => onChordGuideChange(button.value)}
                title={button.ariaLabel}
                aria-label={button.ariaLabel}
                aria-pressed={chordGuide === button.value}
              >
                {button.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAudioOnlyControls && (
        <div className="toolbar-left">
          {spectrogramToggleButton}
        </div>
      )}

      {showSpectrogramOnlyControls && (
        <div className="toolbar-left">
          {spectrogramToggleButton}
        </div>
      )}

      {sheetMusicViewEnabled && (
        <div className="toolbar-left">
          {spectrogramToggleButton}
          {sheetMusicToggleButton}
          {mode !== 'spectrogram' && (
            <button
              className={`tool-button icon-only sheet-track-scope-toggle ${sheetMusicTrackScopeEnabled ? 'active' : ''}`}
              onClick={() => onSheetMusicTrackScopeToggle?.()}
              title={sheetMusicTrackScopeEnabled ? 'Show Active Region Only' : 'Show Entire Track'}
              aria-label={sheetMusicTrackScopeEnabled ? 'Show Active Region Only' : 'Show Entire Track'}
            >
              <TbArrowBarToUp className="sheet-track-scope-icon" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      <div className="toolbar-right">
        {sheetMusicViewEnabled && (
          <KGDropdown
            options={sheetQuantizationOptions}
            value={sheetQuantization}
            onChange={(value) => onSheetQuantizationChange?.(value)}
            label="Sheet Quant."
            buttonClassName="sheet-quantization"
            showValueAsLabel={true}
          />
        )}
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

        {!sheetMusicViewEnabled && (
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
        )}

        {showSpecMenu && (
          <div className="quant-dropdown-container" ref={specMenuRef}>
            <button
              className="quant-button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title="More options"
            >
              ...
            </button>
            {showMoreMenu && (
              <div className="quant-dropdown" style={{ right: 0, left: 'auto', width: 'auto', whiteSpace: 'nowrap' }}>
                {onDetectChords && (
                  <div
                    className={`quant-option${detectingChords ? ' disabled' : ''}`}
                    onClick={() => {
                      if (detectingChords) {
                        return;
                      }
                      setShowMoreMenu(false);
                      void onDetectChords();
                    }}
                    aria-disabled={detectingChords}
                  >
                    {detectingChords ? 'Detecting chords...' : 'Detect chords...'}
                  </div>
                )}
                {onDetectTempo && (
                  <div
                    className={`quant-option${detectingTempo ? ' disabled' : ''}`}
                    onClick={() => {
                      if (detectingTempo) {
                        return;
                      }
                      setShowMoreMenu(false);
                      void onDetectTempo();
                    }}
                    aria-disabled={detectingTempo}
                  >
                    {detectingTempo ? 'Detecting tempo...' : 'Detect tempo...'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PianoRollToolbar;
