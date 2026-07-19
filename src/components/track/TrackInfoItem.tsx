import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KGTrack } from '../../core/track/KGTrack';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { useProjectStore } from '../../stores/projectStore';
import { TbPiano } from 'react-icons/tb';
import { TbDots } from 'react-icons/tb';
import { FaFileAudio } from 'react-icons/fa';
import KGDropdown from '../common/KGDropdown';
import ColorPalettePopup from '../common/ColorPalettePopup';
import FileImportModal from '../common/FileImportModal';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { resolveInstrumentDefinition, resolvePlaybackInstrument } from '../../core/instruments/instrumentResolver';
import { DEBUG_MODE } from '../../constants/uiConstants';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { showAlert, showConfirm } from '../../util/dialogUtil';
import type { TrackAutomationType } from '../../core/track/KGTrackAutomationPoint';
import { AUDIO_IMPORT_ACCEPTED_TYPES } from '../../util/audioImportUtil';
import { useI18n } from '../../i18n/useI18n';
import { getInstrumentDisplayName } from '../../i18n/instruments';
import { convertTrackToMidi } from '../../util/midiUtil';
import { downloadBlob } from '../../util/miscUtil';
import { KGCore } from '../../core/KGCore';
import TransposeSettingsPopup from '../TransposeSettingsPopup';
import { UpdateMidiTrackTransposeCommand } from '../../core/commands';
import DuplicateTrackDialog from './DuplicateTrackDialog';

const UNITY_POS = 750;
const SLIDER_MAX = 1000;

function sliderToDb(pos: number): number {
  const MIN = AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
  const MAX = AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB;
  if (pos <= 0) return MIN;
  if (pos >= SLIDER_MAX) return MAX;
  if (pos <= UNITY_POS) {
    const t = pos / UNITY_POS;
    return MIN * (1 - t * t);
  }
  return MAX * (pos - UNITY_POS) / (SLIDER_MAX - UNITY_POS);
}

function dbToSlider(db: number): number {
  const MIN = AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB;
  const MAX = AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB;
  if (db <= MIN) return 0;
  if (db >= MAX) return SLIDER_MAX;
  if (db <= 0) return Math.round(Math.sqrt(1 - db / MIN) * UNITY_POS);
  return Math.round(UNITY_POS + (db / MAX) * (SLIDER_MAX - UNITY_POS));
}

function formatDb(db: number): string {
  if (db <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB) return '−∞';
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
}
interface TrackInfoItemProps {
  track: KGTrack;
  index: number;
  isDragging: boolean;
  isDragOver: boolean;
  onTrackClick?: () => void;
  onTrackNameEdit: (track: KGTrack, newName: string) => void; // eslint-disable-line no-unused-vars
  onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void; // eslint-disable-line no-unused-vars
  onDragOver: (e: React.DragEvent<HTMLDivElement>, index: number) => void; // eslint-disable-line no-unused-vars
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void; // eslint-disable-line no-unused-vars
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void; // eslint-disable-line no-unused-vars
}

const TrackInfoItem: React.FC<TrackInfoItemProps> = ({
  track,
  index,
  isDragging,
  isDragOver,
  onTrackClick,
  onTrackNameEdit,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}) => {
  const { t } = useI18n();
  const { selectedTrackId, setSelectedTrack, duplicateTrack, removeTrack, toggleInstrumentSelectionForTrack, importAudioToTrack, tracks: allTracks, projectName, setStatus } = useProjectStore();
  const activeTrackAutomationTrackId = useProjectStore(state => state.activeTrackAutomationTrackId);
  const activeTrackAutomationType = useProjectStore(state => state.activeTrackAutomationType);
  const setTrackAutomationView = useProjectStore(state => state.setTrackAutomationView);
  const isSelected = selectedTrackId === track.getId().toString();
  // Inline instrument dropdown removed; use InstrumentSelection panel instead
  
  // Initialize current instrument from track data
  const getTrackInstrument = () => {
    if (track instanceof KGMidiTrack) {
      return track.getInstrument();
    }
    return 'acoustic_grand_piano'; // Default fallback
  };
  
  const [currentInstrument, setCurrentInstrument] = useState(getTrackInstrument());
  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false);
  const [showAudioImportModal, setShowAudioImportModal] = useState(false);
  const [showAutomationDropdown, setShowAutomationDropdown] = useState(false);
  const [showTrackColorPalette, setShowTrackColorPalette] = useState(false);
  const [showTransposePopup, setShowTransposePopup] = useState(false);
  const [showDuplicateTrackDialog, setShowDuplicateTrackDialog] = useState(false);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const automationDropdownRef = useRef<HTMLDivElement>(null);
  const [settingsMenuStyle, setSettingsMenuStyle] = useState<React.CSSProperties>({
    visibility: 'hidden',
  });
  const suppressDragRef = useRef(false);
  const [volume, setVolume] = useState(track.getVolume());
  const [isEditingVolume, setIsEditingVolume] = useState(false);
  const [volumeInputText, setVolumeInputText] = useState('');
  const volumeInputRef = useRef<HTMLInputElement>(null);
  const [isEditingTrackName, setIsEditingTrackName] = useState(false);
  const [trackNameInput, setTrackNameInput] = useState(track.getName());
  const trackNameInputRef = useRef<HTMLInputElement>(null);
  // Local flag to track slider interaction; not used for rendering
  const isAdjustingVolumeRef = useRef(false);
  const [muted, setMuted] = useState(track.getMuted());
  const [solo, setSolo] = useState(track.getSolo());

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSettingsDropdown && 
        settingsDropdownRef.current && 
        !settingsDropdownRef.current.contains(event.target as Node) &&
        !settingsMenuRef.current?.contains(event.target as Node)
      ) {
        setShowSettingsDropdown(false);
        setShowTrackColorPalette(false);
      }
      if (
        showAutomationDropdown &&
        automationDropdownRef.current &&
        !automationDropdownRef.current.contains(event.target as Node)
      ) {
        setShowAutomationDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsDropdown, showAutomationDropdown]);

  React.useLayoutEffect(() => {
    if (!showSettingsDropdown) {
      return;
    }

    const updateSettingsMenuPosition = () => {
      const anchor = settingsDropdownRef.current;
      const menu = settingsMenuRef.current;
      if (!anchor || !menu) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const left = Math.min(
        Math.max(viewportPadding, anchorRect.left),
        Math.max(viewportPadding, window.innerWidth - menu.offsetWidth - viewportPadding),
      );

      setSettingsMenuStyle({
        position: 'fixed',
        top: anchorRect.bottom + 2,
        left,
        visibility: 'visible',
      });
    };

    updateSettingsMenuPosition();
    window.addEventListener('resize', updateSettingsMenuPosition);
    window.addEventListener('scroll', updateSettingsMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateSettingsMenuPosition);
      window.removeEventListener('scroll', updateSettingsMenuPosition, true);
    };
  }, [showSettingsDropdown]);

  // Sync currentInstrument state with actual track instrument value
  const instrumentFromTrack = track instanceof KGMidiTrack ? track.getInstrument() : 'acoustic_grand_piano';
  useEffect(() => {
    setCurrentInstrument(instrumentFromTrack);
  }, [instrumentFromTrack]);

  // Sync volume UI with model when tracks state changes (e.g., load, undo/redo, external updates)
  useEffect(() => {
    setVolume(track.getVolume());
  }, [allTracks, track]);

  useEffect(() => {
    if (!isEditingTrackName) {
      setTrackNameInput(track.getName());
    }
  }, [isEditingTrackName, track, allTracks]);

  // Sync mute/solo UI with the track model on track/project changes
  useEffect(() => {
    setMuted(track.getMuted());
    setSolo(track.getSolo());
  }, [allTracks, track]);
  
  const beginTrackNameEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTrackNameInput(track.getName());
    setIsEditingTrackName(true);
    window.setTimeout(() => {
      trackNameInputRef.current?.focus();
      trackNameInputRef.current?.select();
    }, 0);
  };

  const cancelTrackNameEdit = () => {
    setTrackNameInput(track.getName());
    setIsEditingTrackName(false);
  };

  const commitTrackNameEdit = () => {
    const trimmedName = trackNameInput.trim();
    setIsEditingTrackName(false);
    setTrackNameInput(track.getName());

    if (!trimmedName || trimmedName === track.getName()) {
      return;
    }

    onTrackNameEdit(track, trimmedName);
  };

  // Prevent drag reordering when interacting with interactive controls
  const handleMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isInteractive = !!target.closest(
      'input, button, .volume-slider, .instrument-dropdown, .settings-dropdown'
    );
    suppressDragRef.current = isInteractive;
  };

  const handleDragStartWrapper = (e: React.DragEvent<HTMLDivElement>) => {
    if (suppressDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressDragRef.current = false;
      return;
    }
    onDragStart(e, index);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const next = sliderToDb(Number(e.target.value));
    isAdjustingVolumeRef.current = true;
    setVolume(next);
    try {
      KGAudioInterface.instance().setTrackVolume(track.getId().toString(), next);
    } catch (err) {
      console.error('Failed to update live volume:', err);
    }
  };

  const commitVolumeChange = () => {
    // Only commit if value actually changed from model to avoid extra commands
    const modelVolume = track.getVolume();
    if (Math.abs(modelVolume - volume) < 1e-6) {
      isAdjustingVolumeRef.current = false;
      return;
    }
    try {
      useProjectStore.getState().updateTrackProperties(track.getId(), { volume });
    } catch (err) {
      console.error('Failed to persist volume:', err);
    } finally {
      isAdjustingVolumeRef.current = false;
    }
  };

  const handleResetVolume = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const defaultVolume = AUDIO_INTERFACE_CONSTANTS.DEFAULT_TRACK_VOLUME;
    setVolume(defaultVolume);
    try {
      useProjectStore.getState().updateTrackProperties(track.getId(), { volume: defaultVolume });
    } catch (err) {
      console.error('Failed to reset volume:', err);
    }
  };

  const handleVolumeLabelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const displayText = volume <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB
      ? '-60'
      : volume.toFixed(1);
    setVolumeInputText(displayText);
    setIsEditingVolume(true);
    setTimeout(() => {
      volumeInputRef.current?.select();
    }, 0);
  };

  const commitVolumeLabelInput = () => {
    setIsEditingVolume(false);
    const parsed = parseFloat(volumeInputText);
    if (isNaN(parsed)) return;
    const clamped = Math.max(
      AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB,
      Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, parsed)
    );
    setVolume(clamped);
    try {
      useProjectStore.getState().updateTrackProperties(track.getId(), { volume: clamped });
    } catch (err) {
      console.error('Failed to set volume from label input:', err);
    }
  };

  const handleVolumeLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitVolumeLabelInput();
    } else if (e.key === 'Escape') {
      setIsEditingVolume(false);
    }
  };

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    useProjectStore.getState().updateTrackProperties(track.getId(), { muted: next }).catch(err => {
      setMuted(track.getMuted());
      console.error('Failed to toggle mute:', err);
    });
  };

  const handleToggleSolo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = !solo;
    setSolo(next);
    useProjectStore.getState().updateTrackProperties(track.getId(), { solo: next }).catch(err => {
      setSolo(track.getSolo());
      console.error('Failed to toggle solo:', err);
    });
  };

  // Handle track click
  const handleTrackClick = () => {
    // Select this track when clicked
    setSelectedTrack(track.getId().toString());
    
    if (onTrackClick) {
      onTrackClick();
    }
  };

  // Inline instrument change removed; handled by InstrumentSelection panel

  const isAudioTrack = track instanceof KGAudioTrack;

  // Handle piano button click
  const handlePianoButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Select this track as active when opening instrument panel
    setSelectedTrack(track.getId().toString());
    // Toggle global InstrumentSelection panel (it follows selectedTrackId)
    toggleInstrumentSelectionForTrack();
  };

  // Handle audio import button click
  const handleAudioImportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTrack(track.getId().toString());
    setShowAudioImportModal(true);
  };

  // Handle audio file import
  const handleAudioFileImport = (file: File) => {
    importAudioToTrack(track.getId().toString(), file);
    setShowAudioImportModal(false);
  };

  // Handle settings button click
  const handleSettingsButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettingsDropdown(!showSettingsDropdown);
    if (showSettingsDropdown) {
      setShowTrackColorPalette(false);
    }
  };

  const handleExportMidi = async () => {
    if (!(track instanceof KGMidiTrack)) return;

    try {
      const midiData = convertTrackToMidi(KGCore.instance().getCurrentProject(), track);
      downloadBlob(midiData.buffer as ArrayBuffer, 'audio/midi', `${projectName} - ${track.getName()}.mid`);
      setStatus(t('track.controls.status.trackExportedMidi', { name: track.getName() }));
    } catch (error) {
      console.error('Error exporting track MIDI:', error);
      setStatus(t('track.controls.status.exportMidiError', { error: String(error) }));
      await showAlert(t('track.controls.export.failedMidi', { error: String(error) }));
    }
  };

  const handleAutomationButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setSelectedTrack(track.getId().toString());
    if (automationActive) {
      setTrackAutomationView(track.getId().toString(), null);
      setShowAutomationDropdown(false);
      return;
    }
    setShowAutomationDropdown(open => !open);
  };

  const handleAutomationTypeSelect = (value: string) => {
    setSelectedTrack(track.getId().toString());
    setTrackAutomationView(track.getId().toString(), value as TrackAutomationType);
    setShowAutomationDropdown(false);
  };

  const automationActive = activeTrackAutomationTrackId === track.getId().toString() && activeTrackAutomationType !== null;

  // Handle settings action
  const handleSettingsAction = async (action: string) => {
    if (action === 'Delete Track') {
      try {
        const hasRegions = track.getRegions().length > 0;
        if (hasRegions) {
          const confirmed = await showConfirm(
            t('track.controls.settings.deleteTrackConfirm', { name: track.getName() })
          );
          if (!confirmed) {
            return;
          }
        }

        if (DEBUG_MODE.TRACK_INFO) {
          console.log('Delete track confirmed for:', track.getName());
        }

        // Clear selection if this track is selected
        // if (selectedTrackId === track.getId().toString()) {
        //   setSelectedTrack(null);
        // }

        // Delete the track using the command system
        await removeTrack(track.getId());

        // Close the settings dropdown
        setShowSettingsDropdown(false);
      } catch (error) {
        console.error('Failed to delete track:', error);
        await showAlert(t('track.controls.settings.deleteTrackError'));
      }
    }
  };

  const handleTrackColorSelect = async (color: string | null) => {
    try {
      await useProjectStore.getState().updateTrackProperties(track.getId(), { color });
    } catch (error) {
      console.error('Failed to update track color:', error);
    } finally {
      setShowTrackColorPalette(false);
      setShowSettingsDropdown(false);
    }
  };

  return (
    <div 
      className={`track-info ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      data-test-id={`track-info-${track.getId()}`}
      onClick={handleTrackClick}
      onMouseDownCapture={handleMouseDownCapture}
      draggable={true}
      onDragStart={handleDragStartWrapper}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="track-controls">
        <div className="track-name-and-volume">
          <div className="instrument-image">
            {isAudioTrack ? (
              <img
                src={`${import.meta.env.BASE_URL}resources/instruments/speaker.png`}
                alt="Audio Track"
                width="64"
                height="64"
              />
            ) : (
              <img
                src={`${import.meta.env.BASE_URL}resources/instruments/${resolveInstrumentDefinition(resolvePlaybackInstrument(String(currentInstrument)))?.image || 'piano.png'}`}
                alt={resolveInstrumentDefinition(resolvePlaybackInstrument(String(currentInstrument)))?.displayName ?? getInstrumentDisplayName(currentInstrument as keyof typeof FLUIDR3_INSTRUMENT_MAP, t)}
                width="64"
                height="64"
              />
            )}
          </div>
          <div className="track-name-and-controls">
            {isEditingTrackName ? (
              <input
                ref={trackNameInputRef}
                className="track-name-input"
                type="text"
                value={trackNameInput}
                onChange={(e) => setTrackNameInput(e.target.value.replace(/\r?\n/g, ' '))}
                onBlur={commitTrackNameEdit}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    commitTrackNameEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                    cancelTrackNameEdit();
                  }
                }}
              />
            ) : (
              <div
                className="track-name"
                onClick={beginTrackNameEdit}
                title={track.getName()}
              >
                {track.getName()}
              </div>
            )}
            <div className="volume-slider">
              <input
                type="range"
                min="0"
                max="1000"
                step="1"
                value={dbToSlider(volume)}
                onChange={handleVolumeChange}
                onMouseDown={(e) => { e.stopPropagation(); isAdjustingVolumeRef.current = true; }}
                onMouseUp={(e) => { e.stopPropagation(); commitVolumeChange(); }}
                onTouchStart={(e) => { e.stopPropagation(); isAdjustingVolumeRef.current = true; }}
                onTouchEnd={(e) => { e.stopPropagation(); commitVolumeChange(); }}
                onBlur={commitVolumeChange}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="reset-volume"
                title="Reset to 0 dB"
                aria-label="Reset volume to 0 dB"
                onClick={handleResetVolume}
              >
                ↺
              </button>
              {isEditingVolume ? (
                <input
                  ref={volumeInputRef}
                  className="volume-label volume-label-input"
                  type="text"
                  value={volumeInputText}
                  onChange={(e) => setVolumeInputText(e.target.value)}
                  onKeyDown={handleVolumeLabelKeyDown}
                  onBlur={commitVolumeLabelInput}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="volume-label volume-label-clickable"
                  title="Click to enter dB value"
                  onClick={handleVolumeLabelClick}
                >
                  {formatDb(volume)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="pan-controls">
          <button className={`solo${solo ? ' active' : ''}`} onClick={handleToggleSolo}>S</button>
          <button className={`mute${muted ? ' active' : ''}${muted && solo ? ' solo-overrides-mute' : ''}`} onClick={handleToggleMute}>M</button>
          <div style={{ position: 'relative' }} ref={automationDropdownRef}>
            <button
              className={`automation${automationActive ? ' active' : ''}`}
              onClick={handleAutomationButtonClick}
              title={t('track.controls.automationButton')}
              aria-label={t('track.controls.automationButton')}
            >
              A
            </button>
            <div style={{ position: 'absolute', top: 0, left: 'calc(100% + 6px)', zIndex: 10000 }}>
              <KGDropdown
                options={[
                  { label: t('track.controls.automation.volume'), value: 'volume' },
                  { label: t('track.controls.automation.pan'), value: 'pan' },
                ]}
                value={activeTrackAutomationType ?? ''}
                onChange={handleAutomationTypeSelect}
                label={t('track.controls.automationDropdown')}
                hideButton={true}
                isOpen={showAutomationDropdown}
                onToggle={setShowAutomationDropdown}
                className="automation-dropdown"
              />
            </div>
          </div>
          <div>
            {isAudioTrack ? (
              <button className="instrument" onClick={handleAudioImportClick} title="Import Audio">
                <FaFileAudio />
              </button>
            ) : (
              <button className="instrument" onClick={handlePianoButtonClick}>
                <TbPiano />
              </button>
            )}
          </div>
          <div style={{ position: 'relative' }} ref={settingsDropdownRef}>
            <button
              className="settings"
              onClick={handleSettingsButtonClick}
              title={t('track.controls.moreActions')}
              aria-label={t('track.controls.moreActions')}
            >
              <TbDots />
            </button>
            {showSettingsDropdown && createPortal(
              <div
                ref={settingsMenuRef}
                className="track-settings-menu"
                style={settingsMenuStyle}
              >
                {track instanceof KGMidiTrack && (
                  <button
                    type="button"
                    className="track-settings-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettingsDropdown(false);
                      setShowTransposePopup(true);
                    }}
                  >
                    {t('transpose.menuItem')}
                  </button>
                )}
                {track instanceof KGMidiTrack && (
                  <button
                    type="button"
                    className="track-settings-menu-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettingsDropdown(false);
                      void handleExportMidi();
                    }}
                  >
                    {t('track.controls.exportMidi')}
                  </button>
                )}
                <button
                  type="button"
                  className="track-settings-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSettingsDropdown(false);
                    setShowTrackColorPalette(false);
                    setShowDuplicateTrackDialog(true);
                  }}
                >
                  {t('track.duplicate.menuItem')}
                </button>
                <button
                  type="button"
                  className="track-settings-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTrackColorPalette((open) => !open);
                  }}
                >
                  {t('track.controls.settings.trackColor')}
                </button>
                <button
                  type="button"
                  className="track-settings-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSettingsAction('Delete Track');
                  }}
                >
                  {t('track.controls.settings.deleteTrack')}
                </button>
                {showTrackColorPalette && (
                  <div className="track-settings-color-popup">
                    <ColorPalettePopup
                      selectedColor={track.getColor()}
                      onSelect={handleTrackColorSelect}
                    />
                  </div>
                )}
              </div>,
              document.body,
            )}
          </div>
        </div>
      </div>
      {isAudioTrack && (
        <FileImportModal
          isVisible={showAudioImportModal}
          onClose={() => setShowAudioImportModal(false)}
          onFileImport={handleAudioFileImport}
          acceptedTypes={[...AUDIO_IMPORT_ACCEPTED_TYPES]}
          title="Import Audio"
          description="Drag and drop your audio file here"
        />
      )}
      {track instanceof KGMidiTrack && (
        <TransposeSettingsPopup
          isOpen={showTransposePopup}
          settings={track.getTransposeSettings()}
          noTranspose={track.getNoTranspose()}
          showNoTranspose={true}
          onCancel={() => setShowTransposePopup(false)}
          onConfirm={({ settings, noTranspose }) => {
            try {
              KGCore.instance().executeCommand(
                new UpdateMidiTrackTransposeCommand(track.getId(), settings, noTranspose),
                { rethrow: true },
              );
              useProjectStore.getState().refreshProjectState();
              setStatus(t('transpose.status.trackUpdated'));
              setShowTransposePopup(false);
            } catch (error) {
              void showAlert(t('transpose.error', { error: String(error) }));
            }
          }}
        />
      )}
      <DuplicateTrackDialog
        isOpen={showDuplicateTrackDialog}
        hasRegions={track.getRegions().length > 0}
        onCancel={() => setShowDuplicateTrackDialog(false)}
        onConfirm={(options) => {
          setShowDuplicateTrackDialog(false);
          void duplicateTrack(track.getId(), options);
        }}
      />
    </div>
  );
};

export default TrackInfoItem;
