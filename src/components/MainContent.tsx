import React, { useCallback, useEffect, useState } from 'react';
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
import { ImportChordRegionsCommand } from '../core/commands';
import { TrackType } from '../core/track/KGTrack';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { showAlert } from '../util/dialogUtil';
import {
  buildChordRegionImportPlan,
  CHORD_REGION_IMPORT_REGION_NAME,
  resolveChordRegionImportSelection,
} from '../util/chordRegionImportUtil';
import { useI18n } from '../i18n/useI18n';

interface MainContentProps {
  onTrackClick?: () => void;
}

const MainContent: React.FC<MainContentProps> = ({
  onTrackClick = () => {},
}) => {
  const { t } = useI18n();
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
    openAudioWaveformViewer,
    openSpectrogramViewer,
    openHybridMode,
    hybridAudioRegionId,
    addTrack,
    addAudioTrack,
    projectName,
    showGlobalTracks,
    setShowGlobalTracks,
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
    openAudioWaveformViewer,
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
  const deleteSelectedRegularRegions = mainContentRegions.deleteSelectedRegions;
  const deleteSelectedGlobalRegions = mainContentGlobalTracks.deleteSelectedGlobalRegions;
  const isGlobalRegionId = mainContentRegions.selection.isGlobalRegionId;

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
      if (deleteSelectedGlobalRegions()) {
        return true;
      }
      if (deleteSelectedTrackAutomationPoints()) {
        return true;
      }
      return deleteSelectedRegularRegions();
    });

    return () => {
      regionDeleteManager.unregisterDeleteCallback();
    };
  }, [
    deleteSelectedGlobalRegions,
    deleteSelectedRegularRegions,
    deleteSelectedTrackAutomationPoints,
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
        const hasSelectedGlobalRegions = selectedRegionIds.some(isGlobalRegionId);

        if (!isInPianoRoll && (!showPianoRoll || hasSelectedGlobalRegions)) {
          const deleted = deleteSelectedGlobalRegions()
            || deleteSelectedTrackAutomationPoints()
            || deleteSelectedRegularRegions();
          if (deleted) {
            event.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    deleteSelectedGlobalRegions,
    deleteSelectedRegularRegions,
    deleteSelectedTrackAutomationPoints,
    isGlobalRegionId,
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

  const handleToggleGlobalTracks = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShowGlobalTracks(!showGlobalTracks);
  }, [setShowGlobalTracks, showGlobalTracks]);

  const handleGlobalChordDropToTrack = useCallback(async (draggedRegionId: string, trackIndex: number) => {
    const targetTrack = tracks[trackIndex];
    if (!targetTrack) {
      await showAlert('Unable to find the destination track for this import.');
      return;
    }

    if (targetTrack.getType() !== TrackType.MIDI) {
      await showAlert('Chord regions can only be converted into MIDI tracks. Please drop them onto a MIDI track.');
      return;
    }

    const chordRegionIdSet = new Set(
      globalTracks.flatMap(track => track.getRegions())
        .filter((region): region is KGChordRegion => region instanceof KGChordRegion)
        .map(region => region.getId())
    );
    const selectedChordRegionIds = resolveChordRegionImportSelection(
      draggedRegionId,
      selectedRegionIds.filter(regionId => chordRegionIdSet.has(regionId)),
    );
    const chordRegions = selectedChordRegionIds.map(regionId => (
      globalTracks.flatMap(track => track.getRegions()).find(candidate => candidate.getId() === regionId)
    )).filter((region): region is KGChordRegion => region instanceof KGChordRegion);

    if (chordRegions.length === 0) {
      await showAlert('No chord regions were available to import. Please select a chord region and try again.');
      return;
    }

    const planResult = buildChordRegionImportPlan(chordRegions);
    if (!planResult.ok) {
      await showAlert(planResult.error.message);
      return;
    }

    try {
      const command = new ImportChordRegionsCommand(
        targetTrack.getId().toString(),
        trackIndex,
        planResult.plan.startBeat,
        planResult.plan.lengthInBeats,
        planResult.plan.notes,
        CHORD_REGION_IMPORT_REGION_NAME,
      );
      KGCore.instance().executeCommand(command, { rethrow: true });

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        refreshProjectState();
        return;
      }

      mainContentRegions.handleExternalDropComplete(trackIndex, {
        id: createdRegion.getId(),
        trackId: targetTrack.getId().toString(),
        trackIndex,
        barNumber: (createdRegion.getStartFromBeat() / timeSignature.numerator) + 1,
        length: createdRegion.getLength() / timeSignature.numerator,
        name: createdRegion.getName(),
      });
    } catch (error) {
      console.error('[ChordImport] Gesture import failed:', error);
      await showAlert('Unable to import the selected chord regions into a MIDI region. Please try again.');
    }
  }, [globalTracks, mainContentRegions, refreshProjectState, selectedRegionIds, timeSignature.numerator, tracks]);

  const showHybridButtonForAudio = showPianoRoll && pianoRollMode === 'midi-edit';
  const showHybridButtonForMidi = showPianoRoll && (pianoRollMode === 'audio-waveform' || pianoRollMode === 'spectrogram');
  const beatTicksPerBar = Math.max(0, timeSignature.numerator - 1);

  return (
    <div
      className={`main-content${showInstrumentSelection ? ' has-left-instrument' : ''}`}
      onClick={mainContentRegions.handleEmptyMainContentClick}
    >
      <div
        className="main-content-wrapper"
        ref={viewport.mainContentRef}
        onClick={mainContentRegions.handleEmptyMainContentClick}
      >
        <div className="top-left-spacer">
          <div className="track-header-controls">
            <button
              type="button"
              className="track-header-button"
              aria-label={t('mainContent.createTrack')}
              title={t('mainContent.createTrack')}
              onClick={openCreateTrackModal}
            >
              <FaPlus />
            </button>
            <button
              type="button"
              className={`track-header-button${showGlobalTracks ? ' active' : ''}`}
              aria-label={t('mainContent.showGlobalTracks')}
              title={t('mainContent.showGlobalTracks')}
              onClick={handleToggleGlobalTracks}
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
          visible={showGlobalTracks}
          {...mainContentGlobalTracks.sectionProps}
          chordLaneProps={{
            ...mainContentGlobalTracks.sectionProps.chordLaneProps,
            onDropChordRegionsToTrack: handleGlobalChordDropToTrack,
          }}
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
            onOpenWaveform={mainContentRegions.handleOpenWaveform}
            onOpenSpectrogram={mainContentRegions.handleOpenSpectrogram}
            showHybridButtonForAudio={showHybridButtonForAudio}
            showHybridButtonForMidi={showHybridButtonForMidi}
            onOpenHybrid={mainContentRegions.handleOpenHybrid}
            onExternalDropComplete={mainContentRegions.handleExternalDropComplete}
          />
        </div>
      </div>

      {showPianoRoll && (
        <PianoRoll
          onClose={handlePianoRollClose}
          regionId={activeRegionId}
          mode={pianoRollMode}
          requestedSheetMusicViewEnabled={requestedSheetMusicViewEnabled}
          pianoRollViewRequestVersion={pianoRollViewRequestVersion}
          audioRegion={(() => {
            const audioId = pianoRollMode === 'audio-waveform' || pianoRollMode === 'spectrogram'
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
            const audioId = pianoRollMode === 'audio-waveform' || pianoRollMode === 'spectrogram'
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
          projectName={projectName}
        />
      )}

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
    </div>
  );
};

export default MainContent;
