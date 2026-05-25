import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaPlus } from 'react-icons/fa';
import { FaSquareArrowUpRight } from 'react-icons/fa6';
import './MainContent.css';
import { useProjectStore } from '../stores/projectStore';
import { KGCore } from '../core/KGCore';
import { KGAudioRegion } from '../core/region/KGAudioRegion';
import { KGTrack } from '../core/track/KGTrack';
import TrackInfoPanel from './track/TrackInfoPanel';
import TrackGridPanel from './track/TrackGridPanel';
import PianoRoll from './piano-roll/PianoRoll';
import { TrackCreateDialog } from './common';
import { regionDeleteManager } from '../util/regionDeleteUtil';
import { DeleteTrackAutomationPointsCommand } from '../core/commands';
import { useMainContentRegions } from '../hooks/useMainContentRegions';
import { useMainContentGlobalTracks } from '../hooks/useMainContentGlobalTracks';
import { useMainContentViewport } from '../hooks/useMainContentViewport';
import MainContentGlobalTracksSection from './global-track/MainContentGlobalTracksSection';

interface MainContentProps {
  onTrackClick?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  onTrackClick = () => {},
}) => {
  const {
    tracks,
    globalTracks,
    maxBars,
    barWidthMultiplier,
    reorderTracks,
    updateTrack,
    updateTrackProperties,
    timeSignature,
    setPlayheadPosition,
    playheadPosition,
    isPlaying,
    autoScrollEnabled,
    clearAllSelections,
    setSelectedTrack,
    selectedRegionIds,
    showPianoRoll,
    activeRegionId,
    setShowPianoRoll,
    setActiveRegionId,
    pianoRollMode,
    requestedSheetMusicViewEnabled,
    pianoRollViewRequestVersion,
    openMidiPianoRoll,
    openSpectrogramViewer,
    openHybridMode,
    hybridAudioRegionId,
    addTrack,
    addAudioTrack,
    projectName,
    savedProjectName,
    requestPianoRollScroll,
    mainContentScrollRequest,
    activeTrackAutomationTrackId,
    activeTrackAutomationType,
    selectedTrackAutomationPointIds,
    bumpTrackAutomationRedrawVersion,
    bumpAudioWaveformRedrawVersion,
    refreshProjectState,
    showInstrumentSelection,
    isLooping,
    loopingRange,
  } = useProjectStore();

  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [dragOverTrackIndex, setDragOverTrackIndex] = useState<number | null>(null);
  const [showCreateTrackModal, setShowCreateTrackModal] = useState(false);
  const [showGlobalTracksMock, setShowGlobalTracksMock] = useState(false);

  const mainContentRegions = useMainContentRegions({
    tracks,
    globalTracks,
    timeSignature,
    selectedRegionIds,
    clearAllSelections,
    setSelectedTrack,
    showPianoRoll,
    activeRegionId,
    setShowPianoRoll,
    setActiveRegionId,
    openMidiPianoRoll,
    openSpectrogramViewer,
    openHybridMode,
    pianoRollMode,
    updateTrack,
    maxBars,
  });

  const mainContentGlobalTracks = useMainContentGlobalTracks({
    globalTracks,
    selectedRegionIds,
    timeSignature,
    barWidthMultiplier,
    maxBars,
    playheadPosition,
    refreshProjectState,
    bumpAudioWaveformRedrawVersion,
    findProjectRegionById: mainContentRegions.selection.findProjectRegionById,
    isGlobalRegionId: mainContentRegions.selection.isGlobalRegionId,
    selectGlobalRegion: mainContentRegions.selection.selectGlobalRegion,
  });

  const viewport = useMainContentViewport({
    barWidthMultiplier,
    timeSignature,
    isPlaying,
    autoScrollEnabled,
    playheadPosition,
    mainContentScrollRequest,
    maxBars,
    isLooping,
    loopingRange,
    setPlayheadPosition,
    requestPianoRollScroll,
    editingRegionIds: mainContentGlobalTracks.editingRegionIds,
    findProjectRegionById: mainContentRegions.selection.findProjectRegionById,
  });

  const deleteSelectedTrackAutomationPoints = useCallback((): boolean => {
    if (!activeTrackAutomationTrackId || !activeTrackAutomationType || selectedTrackAutomationPointIds.length === 0) {
      return false;
    }

    const track = tracks.find(candidate => candidate.getId().toString() === activeTrackAutomationTrackId);
    if (!track) {
      return false;
    }

    try {
      KGCore.instance().executeCommand(new DeleteTrackAutomationPointsCommand(
        track.getId(),
        activeTrackAutomationType,
        selectedTrackAutomationPointIds
      ));
      bumpTrackAutomationRedrawVersion();
      updateTrack(track);
      refreshProjectState();
      return true;
    } catch (error) {
      console.error('Error deleting track automation points:', error);
      return false;
    }
  }, [
    activeTrackAutomationTrackId,
    activeTrackAutomationType,
    bumpTrackAutomationRedrawVersion,
    refreshProjectState,
    selectedTrackAutomationPointIds,
    tracks,
    updateTrack,
  ]);

  useEffect(() => {
    regionDeleteManager.registerDeleteCallback(() => {
      if (mainContentGlobalTracks.deleteSelectedGlobalRegions()) {
        return true;
      }
      if (deleteSelectedTrackAutomationPoints()) {
        return true;
      }
      return mainContentRegions.deleteSelectedRegions();
    });

    return () => {
      regionDeleteManager.unregisterDeleteCallback();
    };
  }, [
    deleteSelectedTrackAutomationPoints,
    mainContentGlobalTracks,
    mainContentRegions,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input')
      )) {
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        const isInPianoRoll = document.querySelector('.piano-roll')?.contains(event.target as Node);
        const hasSelectedGlobalRegions = selectedRegionIds.some(mainContentRegions.selection.isGlobalRegionId);

        if (!isInPianoRoll && (!showPianoRoll || hasSelectedGlobalRegions)) {
          const deleted = mainContentGlobalTracks.deleteSelectedGlobalRegions()
            || deleteSelectedTrackAutomationPoints()
            || mainContentRegions.deleteSelectedRegions();
          if (deleted) {
            event.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    deleteSelectedTrackAutomationPoints,
    mainContentGlobalTracks,
    mainContentRegions,
    selectedRegionIds,
    showPianoRoll,
  ]);

  const handleTrackNameEdit = useCallback((track: KGTrack, newName: string) => {
    updateTrackProperties(track.getId(), { name: newName });
  }, [updateTrackProperties]);

  const handleTracksReordered = useCallback((fromIndex: number, toIndex: number) => {
    reorderTracks(fromIndex, toIndex);
    setDraggedTrackIndex(null);
    setDragOverTrackIndex(null);
  }, [reorderTracks]);

  const handlePianoRollClose = useCallback(() => {
    setShowPianoRoll(false);
    setActiveRegionId(null);
  }, [setActiveRegionId, setShowPianoRoll]);

  const openCreateTrackModal = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    setShowCreateTrackModal(true);
  }, []);

  const handleToggleGlobalTracksMock = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShowGlobalTracksMock(previous => !previous);
  }, []);

  const showHybridButtonForAudio = showPianoRoll && pianoRollMode === 'midi-edit';
  const showHybridButtonForMidi = showPianoRoll && pianoRollMode === 'spectrogram';
  const beatTicksPerBar = Math.max(0, timeSignature.numerator - 1);

  return (
    <div
      className={`main-content${showInstrumentSelection ? ' has-left-instrument' : ''}`}
      ref={viewport.mainContentRef}
      onClick={mainContentRegions.handleEmptyMainContentClick}
    >
      <div className="main-content-wrapper" onClick={mainContentRegions.handleEmptyMainContentClick}>
        <div className="top-left-spacer">
          <div className="track-header-controls">
            <button
              type="button"
              className="track-header-button"
              aria-label="Create track"
              title="Create track"
              onClick={openCreateTrackModal}
            >
              <FaPlus />
            </button>
            <button
              type="button"
              className={`track-header-button${showGlobalTracksMock ? ' active' : ''}`}
              aria-label="Show global tracks"
              title="Show global tracks"
              onClick={handleToggleGlobalTracksMock}
            >
              <FaSquareArrowUpRight />
            </button>
          </div>
        </div>

        <div
          className="bar-numbers"
          ref={viewport.barNumbersRef}
          onMouseDown={viewport.handleBarNumbersMouseDown}
        >
          {Array.from({ length: maxBars }, (_, index) => (
            <div
              key={index}
              className={`bar-number-cell${viewport.isBarInLoopRange(index) ? ' looped' : ''}`}
              data-testid="bar-number-cell"
            >
              <div className="bar-number-label">{index + 1}</div>
              <div className="bar-beat-markers" data-testid="bar-beat-markers">
                <div className="bar-boundary-marker" />
                {Array.from({ length: beatTicksPerBar }, (_, beatIndex) => (
                  <div
                    key={beatIndex}
                    className="beat-marker"
                    style={{ left: `${((beatIndex + 1) / timeSignature.numerator) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <MainContentGlobalTracksSection
          visible={showGlobalTracksMock}
          {...mainContentGlobalTracks.sectionProps}
        />

        <div className="main-content-body" onClick={mainContentRegions.handleEmptyMainContentClick}>
          <TrackInfoPanel
            tracks={tracks}
            onTrackClick={onTrackClick}
            onTrackNameEdit={handleTrackNameEdit}
            onTracksReordered={handleTracksReordered}
          />

          <TrackGridPanel
            tracks={tracks}
            regions={mainContentRegions.regions}
            maxBars={maxBars}
            timeSignature={timeSignature}
            draggedTrackIndex={draggedTrackIndex}
            dragOverTrackIndex={dragOverTrackIndex}
            selectedRegionId={mainContentRegions.selection.selectedRegionId}
            projectName={projectName}
            onRegionCreated={mainContentRegions.handleRegionCreated}
            onRegionUpdated={mainContentRegions.handleRegionUpdated}
            onRegionClick={mainContentRegions.handleRegionClick}
            onRegionLassoSelection={mainContentRegions.handleRegionLassoSelection}
            onRegionLassoCommit={mainContentRegions.handleRegionLassoCommit}
            onOpenPianoRoll={mainContentRegions.handleOpenPianoRoll}
            onOpenSpectrogram={mainContentRegions.handleOpenSpectrogram}
            showHybridButtonForAudio={showHybridButtonForAudio}
            showHybridButtonForMidi={showHybridButtonForMidi}
            onOpenHybrid={mainContentRegions.handleOpenHybrid}
            onExternalDropComplete={mainContentRegions.handleExternalDropComplete}
          />
        </div>
      </div>

      {showCreateTrackModal && (
        <TrackCreateDialog
          onResolve={(result) => {
            setShowCreateTrackModal(false);
            if (result === 'audio') {
              addAudioTrack();
            } else if (result === 'midi') {
              addTrack();
            }
          }}
        />
      )}
      {showPianoRoll && createPortal(
        <PianoRoll
          onClose={handlePianoRollClose}
          regionId={activeRegionId}
          mode={pianoRollMode}
          requestedSheetMusicViewEnabled={requestedSheetMusicViewEnabled}
          pianoRollViewRequestVersion={pianoRollViewRequestVersion}
          audioRegion={(() => {
            const audioId = pianoRollMode === 'spectrogram'
              ? activeRegionId
              : pianoRollMode === 'hybrid'
                ? hybridAudioRegionId
                : null;
            if (!audioId) {
              return undefined;
            }

            for (const track of tracks) {
              const region = track.getRegions().find(candidate => candidate.getId() === audioId);
              if (region && region.getCurrentType() === 'KGAudioRegion') {
                return region as unknown as KGAudioRegion;
              }
            }
            return undefined;
          })()}
          trackId={(() => {
            const audioId = pianoRollMode === 'spectrogram'
              ? activeRegionId
              : pianoRollMode === 'hybrid'
                ? hybridAudioRegionId
                : null;
            if (!audioId) {
              return undefined;
            }

            for (const track of tracks) {
              if (track.getRegions().some(region => region.getId() === audioId)) {
                return track.getId().toString();
              }
            }
            return undefined;
          })()}
          projectName={savedProjectName}
        />,
        document.body
      )}
    </div>
  );
};

export default MainContent;
