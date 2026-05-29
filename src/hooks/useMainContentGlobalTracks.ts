import { useCallback, useState } from 'react';
import type { KeySignature } from '../core/KGProject';
import { KGCore } from '../core/KGCore';
import { GlobalTrackType, KGGlobalTrack } from '../core/global-track';
import { KGRegion } from '../core/region/KGRegion';
import { KGChordRegion } from '../core/region/KGChordRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGMarkerRegion } from '../core/region/KGMarkerRegion';
import {
  CreateChordRegionCommand,
  CreateGlobalMarkerRegionCommand,
  CreateKeySignatureRegionCommand,
  CreateTempoRegionCommand,
  DeleteKeySignatureRegionCommand,
  DeleteMultipleGlobalRegionsCommand,
  DeleteMultipleKeySignatureRegionsCommand,
  DeleteMultipleTempoRegionsCommand,
  DeleteTempoRegionCommand,
  InsertChordRegionAtBeatCommand,
  MoveGlobalRegionCommand,
  ResizeGlobalRegionCommand,
  ResizeKeySignatureRegionCommand,
  ResizeTempoRegionCommand,
  UpdateChordRegionCommand,
  UpdateGlobalRegionTextCommand,
  UpdateKeySignatureRegionCommand,
  UpdateTempoRegionCommand,
} from '../core/commands';
import type { RegionClickOptions } from '../components/interfaces';
import { TIME_CONSTANTS } from '../constants/coreConstants';
import {
  DEFAULT_MARKER_REGION_NAME,
  getSortedKeySignatureRegions,
  getSortedTempoRegions,
} from '../util/globalTrackUtil';
import type MainContentGlobalTracksSection from '../components/global-track/MainContentGlobalTracksSection';

interface UseMainContentGlobalTracksParams {
  globalTracks: KGGlobalTrack[];
  selectedRegionIds: string[];
  timeSignature: { numerator: number; denominator: number };
  barWidthMultiplier: number;
  maxBars: number;
  playheadPosition: number;
  refreshProjectState: () => void;
  bumpAudioWaveformRedrawVersion: () => void;
  findProjectRegionById: (regionId: string) => KGRegion | null;
  isGlobalRegionId: (regionId: string) => boolean;
  selectGlobalRegion: (regionId: string, options?: RegionClickOptions) => void;
}

type GlobalTracksSectionProps = React.ComponentProps<typeof MainContentGlobalTracksSection>;
type MarkerLaneProps = GlobalTracksSectionProps['markerLaneProps'];
type TempoLaneProps = GlobalTracksSectionProps['tempoLaneProps'];
type KeySignatureLaneProps = GlobalTracksSectionProps['keySignatureLaneProps'];
type ChordLaneProps = GlobalTracksSectionProps['chordLaneProps'];

const DEFAULT_REGION_CLICK_OPTIONS: RegionClickOptions = {
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
};

export interface UseMainContentGlobalTracksResult {
  deleteSelectedGlobalRegions: () => boolean;
  editingRegionIds: string[];
  sectionProps: Omit<GlobalTracksSectionProps, 'visible'>;
}

export function useMainContentGlobalTracks({
  globalTracks,
  selectedRegionIds,
  timeSignature,
  barWidthMultiplier,
  maxBars,
  playheadPosition,
  refreshProjectState,
  bumpAudioWaveformRedrawVersion,
  findProjectRegionById,
  isGlobalRegionId,
  selectGlobalRegion,
}: UseMainContentGlobalTracksParams): UseMainContentGlobalTracksResult {
  const [editingGlobalRegionId, setEditingGlobalRegionId] = useState<string | null>(null);
  const [editingGlobalRegionText, setEditingGlobalRegionText] = useState('');
  const [editingKeySignatureRegionId, setEditingKeySignatureRegionId] = useState<string | null>(null);
  const [editingTempoRegionId, setEditingTempoRegionId] = useState<string | null>(null);
  const [editingTempoText, setEditingTempoText] = useState('');
  const [editingChordRegionId, setEditingChordRegionId] = useState<string | null>(null);

  const markerTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Marker) ?? null;
  const markerRegions = (markerTrack?.getRegions() ?? []).filter(
    (region): region is KGMarkerRegion => region instanceof KGMarkerRegion
  );
  const signatureTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Signature) ?? null;
  const signatureRegions = signatureTrack
    ? getSortedKeySignatureRegions(signatureTrack, timeSignature.numerator)
    : [];
  const tempoTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Tempo) ?? null;
  const tempoRegions = tempoTrack
    ? getSortedTempoRegions(tempoTrack, timeSignature.numerator)
    : [];
  const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord) ?? null;
  const chordRegions = (chordTrack?.getRegions() ?? []).filter(
    (region): region is KGChordRegion => region instanceof KGChordRegion
  );

  const beginEditingGlobalRegion = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (!(region instanceof KGMarkerRegion)) {
      return;
    }

    setEditingGlobalRegionId(regionId);
    setEditingGlobalRegionText(region.getName());
  }, [findProjectRegionById]);

  const beginEditingKeySignatureRegion = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (region instanceof KGKeySignatureRegion) {
      setEditingKeySignatureRegionId(regionId);
    }
  }, [findProjectRegionById]);

  const beginEditingTempoRegion = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (!(region instanceof KGTempoRegion)) {
      return;
    }

    setEditingTempoRegionId(regionId);
    setEditingTempoText(region.getBpm().toString());
  }, [findProjectRegionById]);

  const beginEditingChordRegion = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (region instanceof KGChordRegion) {
      setEditingChordRegionId(regionId);
    }
  }, [findProjectRegionById]);

  const commitGlobalRegionEdit = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (!(region instanceof KGMarkerRegion)) {
      setEditingGlobalRegionId(null);
      setEditingGlobalRegionText('');
      return;
    }

    const trimmedText = editingGlobalRegionText.replace(/\r?\n/g, ' ').trim();
    setEditingGlobalRegionId(null);
    setEditingGlobalRegionText('');

    if (!trimmedText || trimmedText === region.getName()) {
      return;
    }

    try {
      KGCore.instance().executeCommand(new UpdateGlobalRegionTextCommand(regionId, trimmedText));
      refreshProjectState();
    } catch (error) {
      console.error('Error updating marker text:', error);
    }
  }, [editingGlobalRegionText, findProjectRegionById, refreshProjectState]);

  const createMarkerAtBeat = useCallback((requestedStartBeat: number) => {
    const normalizedStartBeat = Math.max(0, Math.round(requestedStartBeat));
    const occupiedRegion = markerRegions.find(region => region.getStartFromBeat() === normalizedStartBeat);
    if (occupiedRegion) {
      selectGlobalRegion(occupiedRegion.getId(), DEFAULT_REGION_CLICK_OPTIONS);
      beginEditingGlobalRegion(occupiedRegion.getId());
      return;
    }

    try {
      const command = new CreateGlobalMarkerRegionCommand(
        normalizedStartBeat,
        timeSignature.numerator,
        DEFAULT_MARKER_REGION_NAME
      );
      KGCore.instance().executeCommand(command);
      refreshProjectState();

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        return;
      }

      setEditingGlobalRegionId(createdRegion.getId());
      setEditingGlobalRegionText(createdRegion.getName());
    } catch (error) {
      console.error('Error creating marker region:', error);
    }
  }, [beginEditingGlobalRegion, markerRegions, refreshProjectState, selectGlobalRegion, timeSignature.numerator]);

  const createMarkerAtPlayheadBar = useCallback(() => {
    const beatsPerBar = timeSignature.numerator;
    const startBeat = Math.floor(playheadPosition / beatsPerBar) * beatsPerBar;
    createMarkerAtBeat(startBeat);
  }, [createMarkerAtBeat, playheadPosition, timeSignature.numerator]);

  const moveGlobalMarkerRegion = useCallback((regionId: string, startBeat: number) => {
    try {
      KGCore.instance().executeCommand(new MoveGlobalRegionCommand(regionId, Math.round(startBeat)));
      refreshProjectState();
    } catch (error) {
      console.error('Error moving marker region:', error);
    }
  }, [refreshProjectState]);

  const resizeGlobalMarkerRegion = useCallback((regionId: string, edge: 'start' | 'end', beat: number) => {
    try {
      KGCore.instance().executeCommand(new ResizeGlobalRegionCommand(regionId, edge, Math.round(beat)));
      refreshProjectState();
    } catch (error) {
      console.error('Error resizing marker region:', error);
    }
  }, [refreshProjectState]);

  const createKeySignatureAtBar = useCallback((requestedStartBar: number) => {
    const normalizedStartBar = Math.max(0, Math.min(requestedStartBar, maxBars - 1));
    const existingRegionAtStart = signatureRegions.find(region => region.getStartBar() === normalizedStartBar);
    if (existingRegionAtStart) {
      selectGlobalRegion(existingRegionAtStart.getId(), DEFAULT_REGION_CLICK_OPTIONS);
      beginEditingKeySignatureRegion(existingRegionAtStart.getId());
      return;
    }

    try {
      const command = new CreateKeySignatureRegionCommand(normalizedStartBar);
      KGCore.instance().executeCommand(command);
      refreshProjectState();

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        return;
      }

      setEditingKeySignatureRegionId(createdRegion.getId());
    } catch (error) {
      console.error('Error creating key signature region:', error);
    }
  }, [beginEditingKeySignatureRegion, maxBars, refreshProjectState, selectGlobalRegion, signatureRegions]);

  const createKeySignatureAtPlayheadBar = useCallback(() => {
    const beatsPerBar = timeSignature.numerator;
    const startBar = Math.floor(playheadPosition / beatsPerBar);
    createKeySignatureAtBar(startBar);
  }, [createKeySignatureAtBar, playheadPosition, timeSignature.numerator]);

  const resizeKeySignatureRegion = useCallback((regionId: string, edge: 'start' | 'end', bar: number) => {
    try {
      KGCore.instance().executeCommand(new ResizeKeySignatureRegionCommand(regionId, edge, Math.round(bar)));
      refreshProjectState();
    } catch (error) {
      console.error('Error resizing key signature region:', error);
    }
  }, [refreshProjectState]);

  const updateKeySignatureRegion = useCallback((regionId: string, keySignature: KeySignature) => {
    try {
      KGCore.instance().executeCommand(new UpdateKeySignatureRegionCommand(regionId, keySignature));
      setEditingKeySignatureRegionId(null);
      refreshProjectState();
    } catch (error) {
      console.error('Error updating key signature region:', error);
    }
  }, [refreshProjectState]);

  const commitTempoRegionEdit = useCallback((regionId: string) => {
    const region = findProjectRegionById(regionId);
    if (!(region instanceof KGTempoRegion)) {
      setEditingTempoRegionId(null);
      setEditingTempoText('');
      return;
    }

    const trimmed = editingTempoText.trim();
    setEditingTempoRegionId(null);
    setEditingTempoText('');

    if (!trimmed) {
      return;
    }

    const nextBpm = parseInt(trimmed, 10);
    if (Number.isNaN(nextBpm)) {
      return;
    }

    if (nextBpm <= TIME_CONSTANTS.MIN_BPM || nextBpm >= TIME_CONSTANTS.MAX_BPM || nextBpm === region.getBpm()) {
      return;
    }

    try {
      KGCore.instance().executeCommand(new UpdateTempoRegionCommand(regionId, nextBpm));
      bumpAudioWaveformRedrawVersion();
      refreshProjectState();
    } catch (error) {
      console.error('Error updating tempo region:', error);
    }
  }, [bumpAudioWaveformRedrawVersion, editingTempoText, findProjectRegionById, refreshProjectState]);

  const createTempoAtBar = useCallback((requestedStartBar: number) => {
    const normalizedStartBar = Math.max(0, Math.min(requestedStartBar, maxBars - 1));
    const existingRegionAtStart = tempoRegions.find(region => region.getStartBar() === normalizedStartBar);
    if (existingRegionAtStart) {
      selectGlobalRegion(existingRegionAtStart.getId(), DEFAULT_REGION_CLICK_OPTIONS);
      beginEditingTempoRegion(existingRegionAtStart.getId());
      return;
    }

    try {
      const command = new CreateTempoRegionCommand(normalizedStartBar);
      KGCore.instance().executeCommand(command);
      bumpAudioWaveformRedrawVersion();
      refreshProjectState();

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        return;
      }

      setEditingTempoRegionId(createdRegion.getId());
      setEditingTempoText(createdRegion.getBpm().toString());
    } catch (error) {
      console.error('Error creating tempo region:', error);
    }
  }, [beginEditingTempoRegion, bumpAudioWaveformRedrawVersion, maxBars, refreshProjectState, selectGlobalRegion, tempoRegions]);

  const createTempoAtPlayheadBar = useCallback(() => {
    const beatsPerBar = timeSignature.numerator;
    const startBar = Math.floor(playheadPosition / beatsPerBar);
    createTempoAtBar(startBar);
  }, [createTempoAtBar, playheadPosition, timeSignature.numerator]);

  const resizeTempoRegion = useCallback((regionId: string, edge: 'start' | 'end', bar: number) => {
    try {
      KGCore.instance().executeCommand(new ResizeTempoRegionCommand(regionId, edge, Math.round(bar)));
      bumpAudioWaveformRedrawVersion();
      refreshProjectState();
    } catch (error) {
      console.error('Error resizing tempo region:', error);
    }
  }, [bumpAudioWaveformRedrawVersion, refreshProjectState]);

  const createChordAtBeat = useCallback((requestedStartBeat: number) => {
    const normalizedStartBeat = Math.max(0, Math.round(requestedStartBeat));
    const occupiedRegion = chordRegions.find(region => (
      normalizedStartBeat >= region.getStartFromBeat()
      && normalizedStartBeat < region.getStartFromBeat() + region.getLength()
    ));
    if (occupiedRegion) {
      selectGlobalRegion(occupiedRegion.getId(), DEFAULT_REGION_CLICK_OPTIONS);
      beginEditingChordRegion(occupiedRegion.getId());
      return;
    }

    try {
      const command = new CreateChordRegionCommand(normalizedStartBeat, timeSignature.numerator, 'C');
      KGCore.instance().executeCommand(command);
      refreshProjectState();

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        return;
      }

      setEditingChordRegionId(createdRegion.getId());
    } catch (error) {
      console.error('Error creating chord region:', error);
    }
  }, [beginEditingChordRegion, chordRegions, refreshProjectState, selectGlobalRegion, timeSignature.numerator]);

  const createChordAtExactBeat = useCallback((requestedStartBeat: number) => {
    const normalizedStartBeat = Math.max(0, Math.round(requestedStartBeat));
    const occupiedRegion = chordRegions.find(region => (
      normalizedStartBeat > region.getStartFromBeat()
      && normalizedStartBeat < region.getStartFromBeat() + region.getLength()
    ));

    try {
      const command = occupiedRegion
        ? new InsertChordRegionAtBeatCommand(normalizedStartBeat, 'C')
        : new CreateChordRegionCommand(normalizedStartBeat, timeSignature.numerator, 'C');

      KGCore.instance().executeCommand(command);
      refreshProjectState();

      const createdRegion = command.getCreatedRegion();
      if (!createdRegion) {
        if (occupiedRegion) {
          selectGlobalRegion(occupiedRegion.getId(), DEFAULT_REGION_CLICK_OPTIONS);
          beginEditingChordRegion(occupiedRegion.getId());
        }
        return null;
      }

      setEditingChordRegionId(createdRegion.getId());
      return createdRegion;
    } catch (error) {
      console.error('Error creating chord region at exact beat:', error);
      if (occupiedRegion) {
        selectGlobalRegion(occupiedRegion.getId(), DEFAULT_REGION_CLICK_OPTIONS);
        beginEditingChordRegion(occupiedRegion.getId());
      }
      return null;
    }
  }, [beginEditingChordRegion, chordRegions, refreshProjectState, selectGlobalRegion, timeSignature.numerator]);

  const createChordAtPlayheadBeat = useCallback(() => {
    createChordAtExactBeat(playheadPosition);
  }, [createChordAtExactBeat, playheadPosition]);

  const navigateChordPopupByBar = useCallback((currentRegionId: string, direction: 'forward' | 'backward') => {
    const currentRegion = chordRegions.find(region => region.getId() === currentRegionId);
    if (!currentRegion) {
      return;
    }

    const beatsPerBar = timeSignature.numerator;
    const currentStartBeat = currentRegion.getStartFromBeat();
    const currentBarBeat = Math.floor(currentStartBeat / beatsPerBar) * beatsPerBar;
    const targetBarBeat = direction === 'forward'
      ? currentBarBeat + beatsPerBar
      : currentBarBeat - beatsPerBar;
    const songEndBeat = maxBars * beatsPerBar;
    if (targetBarBeat < 0 || targetBarBeat >= songEndBeat) {
      return;
    }

    const sortedRegions = [...chordRegions].sort((left, right) => left.getStartFromBeat() - right.getStartFromBeat());
    const targetRegion = direction === 'forward'
      ? sortedRegions.find(region => region.getStartFromBeat() > currentStartBeat && region.getStartFromBeat() <= targetBarBeat)
      : [...sortedRegions].reverse().find(region => region.getStartFromBeat() < currentStartBeat);

    if (targetRegion) {
      selectGlobalRegion(targetRegion.getId(), DEFAULT_REGION_CLICK_OPTIONS);
      setEditingChordRegionId(targetRegion.getId());
      return;
    }

    if (direction === 'forward') {
      createChordAtExactBeat(targetBarBeat);
    }
  }, [chordRegions, createChordAtExactBeat, maxBars, selectGlobalRegion, timeSignature.numerator]);

  const moveGlobalChordRegion = useCallback((regionId: string, startBeat: number) => {
    try {
      KGCore.instance().executeCommand(new MoveGlobalRegionCommand(regionId, Math.round(startBeat)));
      refreshProjectState();
    } catch (error) {
      console.error('Error moving chord region:', error);
    }
  }, [refreshProjectState]);

  const resizeGlobalChordRegion = useCallback((regionId: string, edge: 'start' | 'end', beat: number) => {
    try {
      KGCore.instance().executeCommand(new ResizeGlobalRegionCommand(regionId, edge, Math.round(beat)));
      refreshProjectState();
    } catch (error) {
      console.error('Error resizing chord region:', error);
    }
  }, [refreshProjectState]);

  const updateChordRegion = useCallback((regionId: string, symbol: string) => {
    const region = findProjectRegionById(regionId);
    if (!(region instanceof KGChordRegion) || region.getSymbol() === symbol) {
      return;
    }

    try {
      KGCore.instance().executeCommand(new UpdateChordRegionCommand(regionId, symbol));
      refreshProjectState();
    } catch (error) {
      console.error('Error updating chord region:', error);
    }
  }, [findProjectRegionById, refreshProjectState]);

  const deleteSelectedGlobalRegions = useCallback((): boolean => {
    const selectedGlobalRegionIds = selectedRegionIds.filter(regionId => isGlobalRegionId(regionId));
    if (selectedGlobalRegionIds.length === 0) {
      return false;
    }

    try {
      const signatureRegionIds = selectedGlobalRegionIds.filter(regionId => findProjectRegionById(regionId) instanceof KGKeySignatureRegion);
      const tempoRegionIds = selectedGlobalRegionIds.filter(regionId => findProjectRegionById(regionId) instanceof KGTempoRegion);
      const markerRegionIds = selectedGlobalRegionIds.filter(regionId => findProjectRegionById(regionId) instanceof KGMarkerRegion);

      if (signatureRegionIds.length > 0 && markerRegionIds.length === 0 && tempoRegionIds.length === 0) {
        KGCore.instance().executeCommand(
          signatureRegionIds.length === 1
            ? new DeleteKeySignatureRegionCommand(signatureRegionIds[0])
            : new DeleteMultipleKeySignatureRegionsCommand(signatureRegionIds)
        );
      } else if (tempoRegionIds.length > 0 && markerRegionIds.length === 0 && signatureRegionIds.length === 0) {
        KGCore.instance().executeCommand(
          tempoRegionIds.length === 1
            ? new DeleteTempoRegionCommand(tempoRegionIds[0])
            : new DeleteMultipleTempoRegionsCommand(tempoRegionIds)
        );
        bumpAudioWaveformRedrawVersion();
      } else if (markerRegionIds.length > 0 && signatureRegionIds.length === 0) {
        KGCore.instance().executeCommand(new DeleteMultipleGlobalRegionsCommand(markerRegionIds));
      } else {
        KGCore.instance().executeCommand(new DeleteMultipleGlobalRegionsCommand(selectedGlobalRegionIds));
      }

      if (editingGlobalRegionId && selectedGlobalRegionIds.includes(editingGlobalRegionId)) {
        setEditingGlobalRegionId(null);
        setEditingGlobalRegionText('');
      }
      if (editingKeySignatureRegionId && selectedGlobalRegionIds.includes(editingKeySignatureRegionId)) {
        setEditingKeySignatureRegionId(null);
      }
      if (editingTempoRegionId && selectedGlobalRegionIds.includes(editingTempoRegionId)) {
        setEditingTempoRegionId(null);
        setEditingTempoText('');
      }
      if (editingChordRegionId && selectedGlobalRegionIds.includes(editingChordRegionId)) {
        setEditingChordRegionId(null);
      }
      refreshProjectState();
      return true;
    } catch (error) {
      console.error('Error deleting global marker regions:', error);
      return false;
    }
  }, [
    bumpAudioWaveformRedrawVersion,
    editingChordRegionId,
    editingGlobalRegionId,
    editingKeySignatureRegionId,
    editingTempoRegionId,
    findProjectRegionById,
    isGlobalRegionId,
    refreshProjectState,
    selectedRegionIds,
  ]);

  const markerLaneProps: MarkerLaneProps = {
    markerRegions,
    maxBars,
    barWidthMultiplier,
    timeSignature,
    selectedRegionIds,
    editingRegionId: editingGlobalRegionId,
    editingText: editingGlobalRegionText,
    onEditingTextChange: setEditingGlobalRegionText,
    onCommitEdit: commitGlobalRegionEdit,
    onCancelEdit: () => {
      setEditingGlobalRegionId(null);
      setEditingGlobalRegionText('');
    },
    onBeginEdit: beginEditingGlobalRegion,
    onSelectRegion: selectGlobalRegion,
    onCreateAtBeat: createMarkerAtBeat,
    onMoveRegion: moveGlobalMarkerRegion,
    onResizeRegion: resizeGlobalMarkerRegion,
  };

  const tempoLaneProps: TempoLaneProps = {
    tempoRegions,
    maxBars,
    barWidthMultiplier,
    selectedRegionIds,
    editingRegionId: editingTempoRegionId,
    editingText: editingTempoText,
    onEditingTextChange: setEditingTempoText,
    onCommitEdit: commitTempoRegionEdit,
    onCancelEdit: () => {
      setEditingTempoRegionId(null);
      setEditingTempoText('');
    },
    onBeginEdit: beginEditingTempoRegion,
    onSelectRegion: selectGlobalRegion,
    onCreateAtBar: createTempoAtBar,
    onResizeRegion: resizeTempoRegion,
  };

  const keySignatureLaneProps: KeySignatureLaneProps = {
    signatureRegions,
    maxBars,
    barWidthMultiplier,
    timeSignature,
    selectedRegionIds,
    pickerRegionId: editingKeySignatureRegionId,
    onClosePicker: () => setEditingKeySignatureRegionId(null),
    onSelectRegion: selectGlobalRegion,
    onCreateAtBar: createKeySignatureAtBar,
    onResizeRegion: resizeKeySignatureRegion,
    onChangeKeySignature: updateKeySignatureRegion,
    onOpenPicker: beginEditingKeySignatureRegion,
  };

  const chordLaneProps: ChordLaneProps = {
    chordRegions,
    maxBars,
    barWidthMultiplier,
    timeSignature,
    selectedRegionIds,
    popupRegionId: editingChordRegionId,
    onClosePopup: () => setEditingChordRegionId(null),
    onSelectRegion: selectGlobalRegion,
    onCreateAtBeat: createChordAtBeat,
    onMoveRegion: moveGlobalChordRegion,
    onResizeRegion: resizeGlobalChordRegion,
    onChangeChord: updateChordRegion,
    onOpenPopup: beginEditingChordRegion,
    onTabNavigate: navigateChordPopupByBar,
  };

  return {
    deleteSelectedGlobalRegions,
    editingRegionIds: [
      editingGlobalRegionId,
      editingTempoRegionId,
      editingKeySignatureRegionId,
      editingChordRegionId,
    ].filter((regionId): regionId is string => Boolean(regionId)),
    sectionProps: {
      onAddMarker: createMarkerAtPlayheadBar,
      onAddTempo: createTempoAtPlayheadBar,
      onAddKeySignature: createKeySignatureAtPlayheadBar,
      onAddChord: createChordAtPlayheadBeat,
      markerLaneProps,
      tempoLaneProps,
      keySignatureLaneProps,
      chordLaneProps,
    },
  };
}
