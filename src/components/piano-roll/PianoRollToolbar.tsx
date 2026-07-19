import React from 'react';
import { FaMousePointer, FaPencilAlt } from 'react-icons/fa';
import { TbArrowBarToUp } from 'react-icons/tb';
import { ColorPalettePopup, KGDropdown } from '../common';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { KGCore } from '../../core/KGCore';
import {
  getTranslatedAutomationOptions,
  type PianoRollAutomationType,
} from './pianoRollAutomation';
import { useI18n } from '../../i18n/useI18n';
import type { PianoRollMode } from '../../constants';

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
  mode?: PianoRollMode;
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
  onConvertToMidi?: () => void | Promise<void>;
  convertToMidiDisabled?: boolean;
  selectedRegionColor?: string;
  onRegionColorSelect?: (color: string | null) => void;
  onSelectNoteByRank?: () => void | Promise<void>;
  onExportMidi?: () => void | Promise<void>;
  onIntelligentArpeggiator?: () => void | Promise<void>;
  onTransposeSettings?: () => void;
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
  onConvertToMidi,
  convertToMidiDisabled = false,
  selectedRegionColor,
  onRegionColorSelect,
  onSelectNoteByRank,
  onExportMidi,
  onIntelligentArpeggiator,
  onTransposeSettings,
}) => {
  const { t } = useI18n();
  const showMidiControls = mode !== 'spectrogram' && mode !== 'audio-waveform' && !sheetMusicViewEnabled;
  const showAudioOnlyControls = mode === 'audio-waveform' && !sheetMusicViewEnabled;
  const showSpectrogramOnlyControls = mode === 'spectrogram' && !sheetMusicViewEnabled;
  const showSpecControls = !sheetMusicViewEnabled && (mode === 'spectrogram' || mode === 'hybrid');
  const showSpecMenu = !sheetMusicViewEnabled && (!!onDetectChords || !!onDetectTempo || !!onConvertToMidi);
  const showMoreMenuButton = showSpecMenu || (!sheetMusicViewEnabled && (!!onSelectNoteByRank || !!onExportMidi || !!onIntelligentArpeggiator || !!onTransposeSettings));
  const automationOptions = React.useMemo(() => getTranslatedAutomationOptions(t), [t]);
  const snapOptions = React.useMemo(
    () => KGPianoRollState.SNAP_OPTIONS.map(option => ({ label: t(option.labelKey), value: option.value })),
    [t],
  );
  const quantPositionOptions = React.useMemo(
    () => KGPianoRollState.QUANT_POS_OPTIONS.map(option => ({ label: t(option.labelKey), value: option.value })),
    [t],
  );
  const quantLengthOptions = React.useMemo(
    () => KGPianoRollState.QUANT_LEN_OPTIONS.map(option => ({ label: t(option.labelKey), value: option.value })),
    [t],
  );
  const POWER_OPTIONS = [
    { label: t('pianoRoll.power.linear'), value: '1.0' },
    { label: t('pianoRoll.power.sqrtDefault'), value: '0.5' },
    { label: t('pianoRoll.power.mild'), value: '0.4' },
    { label: t('pianoRoll.power.strong'), value: '0.3' },
  ];
  const modeOptions = React.useMemo(
    () => Object.entries(KGCore.FUNCTIONAL_CHORDS_DATA).map(([id, data]) => {
      const translationKey = `pianoRoll.modeOption.${id}`;
      const translatedLabel = t(translationKey);
      return {
        label: translatedLabel === translationKey ? data.name : translatedLabel,
        value: id,
      };
    }),
    [t],
  );
  const CHORD_GUIDE_BUTTONS: Array<{ label: string; value: 'N' | 'T' | 'S' | 'D'; ariaLabel: string }> = [
    { label: '⊘', value: 'N', ariaLabel: t('pianoRoll.chordGuide.off') },
    { label: 'T', value: 'T', ariaLabel: t('pianoRoll.chordGuide.tonic') },
    { label: 'S', value: 'S', ariaLabel: t('pianoRoll.chordGuide.subdominant') },
    { label: 'D', value: 'D', ariaLabel: t('pianoRoll.chordGuide.dominant') },
  ];

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
  const [showRegionColorPalette, setShowRegionColorPalette] = React.useState(false);
  const specMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (specMenuRef.current && !specMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
        setShowRegionColorPalette(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  const spectrogramToggleButton = showAudioSpectrogramToggle ? (
    <button
      className={`tool-button icon-only sheet-mode-toggle ${audioSpectrogramEnabled ? 'active' : ''}`}
      onClick={() => onAudioSpectrogramToggle?.()}
      title={t('pianoRoll.spectrogramView')}
      aria-label={t('pianoRoll.spectrogramView')}
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
      title={t('pianoRoll.sheetMusicView')}
      aria-label={t('pianoRoll.sheetMusicView')}
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
            title={t('pianoRoll.pointerTool')}
          >
            <FaMousePointer className="piano-roll-tool-icon" />
          </button>
          <button
            className={`tool-button ${activeTool === 'pencil' ? 'active' : ''}`}
            onClick={() => onToolSelect('pencil')}
            title={t('pianoRoll.pencilTool')}
          >
            <FaPencilAlt className="piano-roll-tool-icon" />
          </button>
          {showAutomationControls && (
            <div className="piano-roll-automation-toolbar-group">
              <button
                className={`tool-button automation-toggle-button ${automationEnabled ? 'active' : ''}`}
                onClick={() => onAutomationToggle?.()}
                title={t('pianoRoll.toggleAutomationLane')}
                aria-label={t('pianoRoll.toggleAutomationLane')}
              >
                A
              </button>
              <KGDropdown
                options={automationOptions}
                value={automationType}
                onChange={(value) => onAutomationTypeChange?.(value as PianoRollAutomationType)}
                label={t('pianoRoll.automation')}
                buttonClassName="automation-type-dropdown"
                showValueAsLabel={true}
              />
            </div>
          )}
          <KGDropdown
            options={modeOptions}
            value={selectedMode}
            onChange={(value) => onModeChange(value)}
            label={t('pianoRoll.mode')}
            buttonClassName="mode-dropdown"
            showValueAsLabel={true}
          />
          <div className="piano-roll-chord-guide-toolbar-group" role="group" aria-label={t('pianoRoll.chordGuide')}>
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
              title={sheetMusicTrackScopeEnabled ? t('pianoRoll.showActiveRegionOnly') : t('pianoRoll.showEntireTrack')}
              aria-label={sheetMusicTrackScopeEnabled ? t('pianoRoll.showActiveRegionOnly') : t('pianoRoll.showEntireTrack')}
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
            label={t('pianoRoll.sheetQuantization')}
            buttonClassName="sheet-quantization"
            showValueAsLabel={true}
          />
        )}
        {showMidiControls && (
          <>
            <KGDropdown
              options={snapOptions}
              value={snapping}
              onChange={(value) => onSnappingSelect(value)}
              label={t('pianoRoll.snap')}
              buttonClassName="snapping"
              showValueAsLabel={true}
            />
            <KGDropdown
              options={quantPositionOptions}
              value={quantPosition}
              onChange={(value) => onQuantSelect('position', value)}
              label={t('pianoRoll.quantizePositionCompact')}
              buttonClassName={`quant-position ${blinkButton === 'quant-position' ? 'button-blink' : ''}`}
            />
            <KGDropdown
              options={quantLengthOptions}
              value={quantLength}
              onChange={(value) => onQuantSelect('length', value)}
              label={t('pianoRoll.quantizeLengthCompact')}
              buttonClassName={`quant-length ${blinkButton === 'quant-length' ? 'button-blink' : ''}`}
            />
          </>
        )}

        {showSpecControls && (
          <div className="spectrogram-toolbar-controls">
            <span className="spectrogram-control-label">{t('pianoRoll.floor')}</span>
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
              label={t('pianoRoll.curve')}
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
              title={t('pianoRoll.zoom')}
              aria-label={t('pianoRoll.zoom')}
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

        {showMoreMenuButton && (
          <div className="quant-dropdown-container" ref={specMenuRef}>
            <button
              className="quant-button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              title={t('pianoRoll.moreOptions')}
              aria-label={t('pianoRoll.moreOptions')}
            >
              ...
            </button>
            {showMoreMenu && (
              <div className="quant-dropdown piano-roll-more-menu" style={{ right: 0, left: 'auto', width: 'auto', whiteSpace: 'nowrap' }}>
                {onRegionColorSelect && (
                  <div className="piano-roll-menu-item-wrapper">
                    <div
                      className="quant-option"
                      onClick={() => setShowRegionColorPalette(open => !open)}
                    >
                      {t('pianoRoll.regionColor')}
                    </div>
                    {showRegionColorPalette && (
                      <div className="piano-roll-region-color-popup">
                        <ColorPalettePopup
                          selectedColor={selectedRegionColor}
                          onSelect={(color) => {
                            onRegionColorSelect(color);
                            setShowRegionColorPalette(false);
                            setShowMoreMenu(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {onTransposeSettings && (
                  <div
                    className="quant-option"
                    onClick={() => {
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      onTransposeSettings();
                    }}
                  >
                    {t('transpose.menuItem')}
                  </div>
                )}
                {onSelectNoteByRank && (
                  <div
                    className="quant-option"
                    onClick={() => {
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      void onSelectNoteByRank();
                    }}
                  >
                    {t('pianoRoll.selectNoteByRank')}
                  </div>
                )}
                {onExportMidi && (
                  <div
                    className="quant-option"
                    onClick={() => {
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      void onExportMidi();
                    }}
                  >
                    {t('pianoRoll.exportMidi')}
                  </div>
                )}
                {onIntelligentArpeggiator && (
                  <div className="quant-option" onClick={() => { setShowRegionColorPalette(false); setShowMoreMenu(false); void onIntelligentArpeggiator(); }}>
                    {t('pianoRoll.intelligentArpeggiator')}
                  </div>
                )}
                {onDetectChords && (
                  <div
                    className={`quant-option${detectingChords ? ' disabled' : ''}`}
                    onClick={() => {
                      if (detectingChords) {
                        return;
                      }
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      void onDetectChords();
                    }}
                    aria-disabled={detectingChords}
                  >
                    {detectingChords ? t('pianoRoll.detectingChords') : t('pianoRoll.detectChords')}
                  </div>
                )}
                {onDetectTempo && (
                  <div
                    className={`quant-option${detectingTempo ? ' disabled' : ''}`}
                    onClick={() => {
                      if (detectingTempo) {
                        return;
                      }
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      void onDetectTempo();
                    }}
                    aria-disabled={detectingTempo}
                  >
                    {detectingTempo ? t('pianoRoll.detectingTempo') : t('pianoRoll.detectTempo')}
                  </div>
                )}
                {onConvertToMidi && (
                  <div
                    className={`quant-option${convertToMidiDisabled ? ' disabled' : ''}`}
                    onClick={() => {
                      if (convertToMidiDisabled) {
                        return;
                      }
                      setShowRegionColorPalette(false);
                      setShowMoreMenu(false);
                      void onConvertToMidi();
                    }}
                    aria-disabled={convertToMidiDisabled}
                  >
                    {t('pianoRoll.convertToMidi')}
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
