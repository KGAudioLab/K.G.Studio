import React, { useState, useRef, useEffect } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { useProjectStore } from '../../stores/projectStore';
import { TbPiano } from 'react-icons/tb';
import { TbSettings } from 'react-icons/tb';
import KGDropdown from '../common/KGDropdown';
import { FLUIDR3_INSTRUMENT_MAP } from '../../constants/generalMidiConstants';
import { DEBUG_MODE } from '../../constants/uiConstants';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
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
  const { selectedTrackId, setSelectedTrack, removeTrack, toggleInstrumentSelectionForTrack, tracks: allTracks } = useProjectStore();
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
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const suppressDragRef = useRef(false);
  const [volume, setVolume] = useState(track.getVolume());
  // Local flag to track slider interaction; not used for rendering
  const isAdjustingVolumeRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [solo, setSolo] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSettingsDropdown && 
        settingsDropdownRef.current && 
        !settingsDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSettingsDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
  // Handle track name edit within the component
  const handleTrackNameClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening piano roll when clicking track name
    
    const newName = prompt("Enter track name:", track.getName());
    if (newName) {
      // Call the parent handler with the new name
      onTrackNameEdit(track, newName);
    }
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
    const next = Number(e.target.value) / 100;
    isAdjustingVolumeRef.current = true;
    setVolume(next);
    try {
      // Live preview: update audio only while sliding
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

  const handleToggleMute = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    try {
      KGAudioInterface.instance().setTrackMute(track.getId().toString(), next);
    } catch (err) {
      console.error('Failed to toggle mute:', err);
    }
  };

  const handleToggleSolo = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const next = !solo;
    setSolo(next);
    try {
      KGAudioInterface.instance().setTrackSolo(track.getId().toString(), next);
    } catch (err) {
      console.error('Failed to toggle solo:', err);
    }
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

  // Handle piano button click
  const handlePianoButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Select this track as active when opening instrument panel
    setSelectedTrack(track.getId().toString());
    // Toggle global InstrumentSelection panel for this track
    toggleInstrumentSelectionForTrack(track.getId().toString());
  };

  // Handle settings button click
  const handleSettingsButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettingsDropdown(!showSettingsDropdown);
  };

  // Handle settings action
  const handleSettingsAction = async (action: string) => {
    if (action === 'Delete Track') {
      const confirmed = window.confirm(`Are you sure you want to delete track "${track.getName()}"?`);
      if (confirmed) {
        try {
          if (DEBUG_MODE.TRACK_INFO) {
            console.log('Delete track confirmed for:', track.getName());
          }

          // Clear selection if this track is selected
          if (selectedTrackId === track.getId().toString()) {
            setSelectedTrack(null);
          }

          // Delete the track using the command system
          await removeTrack(track.getId());
          
          // Close the settings dropdown
          setShowSettingsDropdown(false);
        } catch (error) {
          console.error('Failed to delete track:', error);
          alert('Failed to delete track. Please try again.');
        }
      }
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
            <img 
              src={`${import.meta.env.BASE_URL}resources/instruments/${String(FLUIDR3_INSTRUMENT_MAP[currentInstrument as keyof typeof FLUIDR3_INSTRUMENT_MAP]?.image || 'piano.png')}`} 
              alt={String(FLUIDR3_INSTRUMENT_MAP[currentInstrument as keyof typeof FLUIDR3_INSTRUMENT_MAP]?.displayName || currentInstrument)}
              width="64"
              height="64"
            />
          </div>
          <div className="track-name-and-controls">
            <div 
              className="track-name"
              onClick={handleTrackNameClick}
            >
              {track.getName()}
            </div>
            <div className="volume-slider">
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(volume * 100)}
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
                title="Reset volume"
                aria-label="Reset volume"
                onClick={handleResetVolume}
              >
                ↺
              </button>
            </div>
          </div>
        </div>
        <div className="pan-controls">
          <button className={`solo${solo ? ' active' : ''}`} onClick={handleToggleSolo}>S</button>
          <button className={`mute${muted ? ' active' : ''}`} onClick={handleToggleMute}>M</button>
          <div>
            <button className="instrument" onClick={handlePianoButtonClick}>
              <TbPiano />
            </button>
          </div>
          <div style={{ position: 'relative' }} ref={settingsDropdownRef}>
            <button className="settings" onClick={handleSettingsButtonClick}>
              <TbSettings />
            </button>
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 10000 }}>
              <KGDropdown
                options={['Delete Track']}
                value={''}
                onChange={handleSettingsAction}
                label="Settings"
                hideButton={true}
                isOpen={showSettingsDropdown}
                onToggle={setShowSettingsDropdown}
                className="settings-dropdown"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackInfoItem; 