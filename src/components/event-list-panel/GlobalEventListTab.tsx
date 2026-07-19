import React, { useMemo, useRef, useState } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import KGDropdown from '../common/KGDropdown';
import { KGCore } from '../../core/KGCore';
import type { KeySignature } from '../../core/KGProject';
import { KGGlobalTrack, GlobalTrackType } from '../../core/global-track';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import { KGGlobalRegion } from '../../core/region/KGGlobalRegion';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { KGRegion } from '../../core/region/KGRegion';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import {
  CreateChordRegionCommand,
  CreateGlobalMarkerRegionCommand,
  CreateKeySignatureRegionCommand,
  CreateTempoRegionCommand,
  DeleteMultipleGlobalRegionsCommand,
  DeleteMultipleKeySignatureRegionsCommand,
  DeleteMultipleTempoRegionsCommand,
  DeleteTempoRegionCommand,
  DeleteKeySignatureRegionCommand,
  InsertChordRegionAtBeatCommand,
  MoveGlobalRegionCommand,
  ResizeGlobalRegionCommand,
  ResizeKeySignatureRegionCommand,
  ResizeTempoRegionCommand,
  UpdateChordRegionCommand,
  UpdateGlobalRegionTextCommand,
  UpdateKeySignatureRegionCommand,
  UpdateTempoRegionCommand,
} from '../../core/commands';
import { TIME_CONSTANTS, KEY_SIGNATURE_MAP } from '../../constants/coreConstants';
import {
  formatMidiEventLength,
  formatMidiEventPosition,
  MIDI_EVENT_TICKS_PER_BEAT,
  parseMidiEventLength,
  parseMidiEventLengthDelta,
  parseMidiEventPosition,
  parseMidiEventPositionDelta,
} from '../../util/midiUtil';
import { isModifierKeyPressed } from '../../util/osUtil';
import { parseChordSymbol } from '../../util/chordUtil';
import { showAlert, showConfirm } from '../../util/dialogUtil';
import { getSortedKeySignatureRegions, getSortedTempoRegions } from '../../util/globalTrackUtil';
import { useI18n } from '../../i18n/useI18n';
import { hasChordRegionsInTracks } from '../../util/chordTransposeUtil';
import { getKeySignatureTransposeDelta } from '../../util/midiTransposeUtil';
import EventListPlayhead from './EventListPlayhead';
import { normalizeEventListPlayheadBeat } from './eventListPlayheadUtil';

interface GlobalEventListTabProps {
  globalTracks: KGGlobalTrack[];
  selectedRegionIds: string[];
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  playheadPosition: number;
  refreshProjectState: () => void;
}

type GlobalLaneFilter = 'marker' | 'tempo' | 'key-signature' | 'chord';
type AddGlobalItemType = GlobalLaneFilter;
type GlobalEditableColumn = 'position' | 'val' | 'length';

interface MarkerRowData {
  id: string;
  type: 'marker';
  region: KGMarkerRegion;
  absoluteStartBeat: number;
  durationBeats: number;
}

interface TempoRowData {
  id: string;
  type: 'tempo';
  region: KGTempoRegion;
  absoluteStartBeat: number;
  durationBeats: number;
}

interface KeySignatureRowData {
  id: string;
  type: 'key-signature';
  region: KGKeySignatureRegion;
  absoluteStartBeat: number;
  durationBeats: number;
}

interface ChordRowData {
  id: string;
  type: 'chord';
  region: KGChordRegion;
  absoluteStartBeat: number;
  durationBeats: number;
}

type GlobalRowData = MarkerRowData | TempoRowData | KeySignatureRowData | ChordRowData;

interface GlobalEditingCell {
  rowId: string;
  column: GlobalEditableColumn;
  value: string;
}

const GLOBAL_TYPE_ORDER: Record<GlobalRowData['type'], number> = {
  marker: 0,
  tempo: 1,
  'key-signature': 2,
  chord: 3,
};

const CANONICAL_KEY_SIGNATURES = Object.keys(KEY_SIGNATURE_MAP) as KeySignature[];

const getRowStatus = (row: GlobalRowData, t: (key: string, params?: Record<string, string | number>) => string): string => {
  switch (row.type) {
    case 'marker':
      return t('eventList.global.status.marker');
    case 'tempo':
      return t('eventList.global.status.tempo');
    case 'key-signature':
      return t('eventList.global.status.keySignature');
    case 'chord':
      return t('eventList.global.status.chord');
  }
};

const getRowValue = (row: GlobalRowData): string => {
  switch (row.type) {
    case 'marker':
      return row.region.getName();
    case 'tempo':
      return row.region.getBpm().toString();
    case 'key-signature':
      return row.region.getKeySignature();
    case 'chord':
      return row.region.getSymbol();
  }
};

const findRegionRowType = (region: KGGlobalRegion): GlobalRowData['type'] | null => {
  if (region instanceof KGMarkerRegion) return 'marker';
  if (region instanceof KGTempoRegion) return 'tempo';
  if (region instanceof KGKeySignatureRegion) return 'key-signature';
  if (region instanceof KGChordRegion) return 'chord';
  return null;
};

const buildValueValidationMessage = (
  type: GlobalRowData['type'],
  t: (key: string, params?: Record<string, string | number>) => string
): string => {
  switch (type) {
    case 'marker':
      return t('eventList.global.validation.marker');
    case 'tempo':
      return t('eventList.global.validation.tempo', {
        min: TIME_CONSTANTS.MIN_BPM + 1,
        max: TIME_CONSTANTS.MAX_BPM - 1,
      });
    case 'key-signature':
      return t('eventList.global.validation.keySignature');
    case 'chord':
      return t('eventList.global.validation.chord');
  }
};

const GlobalEventListTab: React.FC<GlobalEventListTabProps> = ({
  globalTracks,
  selectedRegionIds,
  maxBars,
  timeSignature,
  playheadPosition,
  refreshProjectState,
}) => {
  const { t } = useI18n();
  const [showMarkers, setShowMarkers] = useState(true);
  const [showTempo, setShowTempo] = useState(true);
  const [showKeySignature, setShowKeySignature] = useState(true);
  const [showChords, setShowChords] = useState(true);
  const [addGlobalItemType, setAddGlobalItemType] = useState<AddGlobalItemType>('marker');
  const [editingCell, setEditingCell] = useState<GlobalEditingCell | null>(null);
  const rangeAnchorRowIdRef = useRef<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const pendingSingleClickSelectionRef = useRef<number | null>(null);

  const addGlobalItemOptions = useMemo<Array<{ label: string; value: AddGlobalItemType }>>(() => ([
    { label: t('eventList.global.addType.marker'), value: 'marker' },
    { label: t('eventList.global.addType.tempo'), value: 'tempo' },
    { label: t('eventList.global.addType.keySignature'), value: 'key-signature' },
    { label: t('eventList.global.addType.chord'), value: 'chord' },
  ]), [t]);

  const markerTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Marker) ?? null;
  const tempoTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Tempo) ?? null;
  const signatureTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Signature) ?? null;
  const chordTrack = globalTracks.find(track => track.getType() === GlobalTrackType.Chord) ?? null;

  const markerRows = useMemo<MarkerRowData[]>(() => (
    showMarkers && markerTrack
      ? markerTrack.getRegions().filter((region): region is KGMarkerRegion => region instanceof KGMarkerRegion).map(region => ({
        id: region.getId(),
        type: 'marker',
        region,
        absoluteStartBeat: region.getStartFromBeat(),
        durationBeats: region.getLength(),
      }))
      : []
  ), [globalTracks, markerTrack, showMarkers]);

  const tempoRows = useMemo<TempoRowData[]>(() => (
    showTempo && tempoTrack
      ? getSortedTempoRegions(tempoTrack, timeSignature.numerator).map(region => ({
        id: region.getId(),
        type: 'tempo',
        region,
        absoluteStartBeat: region.getStartFromBeat(),
        durationBeats: region.getLength(),
      }))
      : []
  ), [globalTracks, showTempo, tempoTrack, timeSignature.numerator]);

  const keySignatureRows = useMemo<KeySignatureRowData[]>(() => (
    showKeySignature && signatureTrack
      ? getSortedKeySignatureRegions(signatureTrack, timeSignature.numerator).map(region => ({
        id: region.getId(),
        type: 'key-signature',
        region,
        absoluteStartBeat: region.getStartFromBeat(),
        durationBeats: region.getLength(),
      }))
      : []
  ), [globalTracks, showKeySignature, signatureTrack, timeSignature.numerator]);

  const chordRows = useMemo<ChordRowData[]>(() => (
    showChords && chordTrack
      ? chordTrack.getRegions().filter((region): region is KGChordRegion => region instanceof KGChordRegion).map(region => ({
        id: region.getId(),
        type: 'chord',
        region,
        absoluteStartBeat: region.getStartFromBeat(),
        durationBeats: region.getLength(),
      }))
      : []
  ), [chordTrack, globalTracks, showChords]);

  const globalRows: GlobalRowData[] = useMemo(() => (
    [...markerRows, ...tempoRows, ...keySignatureRows, ...chordRows].sort((a, b) => {
      if (a.absoluteStartBeat !== b.absoluteStartBeat) {
        return a.absoluteStartBeat - b.absoluteStartBeat;
      }
      const typeDelta = GLOBAL_TYPE_ORDER[a.type] - GLOBAL_TYPE_ORDER[b.type];
      if (typeDelta !== 0) {
        return typeDelta;
      }
      return a.id.localeCompare(b.id);
    })
  ), [chordRows, keySignatureRows, markerRows, tempoRows]);

  const visibleRowIds = new Set(globalRows.map(row => row.id));
  const selectedRowIdSet = new Set(selectedRegionIds.filter(regionId => visibleRowIds.has(regionId)));
  const visibleSelectedRows = globalRows.filter(row => selectedRowIdSet.has(row.id));

  React.useEffect(() => {
    if (editingCell) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingCell?.rowId, editingCell?.column]);

  React.useEffect(() => (
    () => {
      if (pendingSingleClickSelectionRef.current !== null) {
        window.clearTimeout(pendingSingleClickSelectionRef.current);
      }
    }
  ), []);

  const clearPendingSingleClickSelection = () => {
    if (pendingSingleClickSelectionRef.current !== null) {
      window.clearTimeout(pendingSingleClickSelectionRef.current);
      pendingSingleClickSelectionRef.current = null;
    }
  };

  const commitSelection = (nextSelectedIds: Set<string>) => {
    const core = KGCore.instance();
    const selectedRegions = globalRows
      .filter(row => nextSelectedIds.has(row.id))
      .map(row => row.region);
    const previouslySelectedRegions = core.getSelectedItems().filter(item => item instanceof KGRegion);

    globalTracks.forEach(track => {
      track.getRegions().forEach(region => {
        if (!(region instanceof KGGlobalRegion)) {
          return;
        }
        if (nextSelectedIds.has(region.getId())) {
          region.select();
        } else if (visibleRowIds.has(region.getId())) {
          region.deselect();
        }
      });
    });

    if (previouslySelectedRegions.length > 0) {
      core.removeSelectedItems(previouslySelectedRegions);
    }
    if (selectedRegions.length > 0) {
      core.addSelectedItems(selectedRegions);
    }
  };

  const getTargetRowsForEdit = (row: GlobalRowData, column: GlobalEditableColumn): GlobalRowData[] => {
    if (!selectedRowIdSet.has(row.id)) {
      return [row];
    }

    const sameTypeRows = globalRows.filter(candidate => (
      candidate.type === row.type && selectedRowIdSet.has(candidate.id)
    ));

    if (sameTypeRows.length <= 1) {
      return [row];
    }

    if (column === 'val') {
      return sameTypeRows;
    }

    if (row.type === 'marker' || row.type === 'chord') {
      return sameTypeRows;
    }

    return [row];
  };

  const startEditingCell = (rowId: string, column: GlobalEditableColumn, value: string) => {
    clearPendingSingleClickSelection();
    setEditingCell({ rowId, column, value });
  };

  const cancelEditingCell = () => {
    setEditingCell(null);
  };

  const selectCreatedOrExistingRegion = (region: KGGlobalRegion) => {
    rangeAnchorRowIdRef.current = region.getId();
    commitSelection(new Set([region.getId()]));
    const rowType = findRegionRowType(region);
    if (!rowType) {
      return;
    }
    const value = region instanceof KGMarkerRegion
      ? region.getName()
      : region instanceof KGTempoRegion
        ? region.getBpm().toString()
        : region instanceof KGKeySignatureRegion
          ? region.getKeySignature()
          : region instanceof KGChordRegion
            ? region.getSymbol()
            : region.getName();
    setEditingCell({ rowId: region.getId(), column: 'val', value });
  };

  const commitEditingCell = async () => {
    if (!editingCell) return;

    const row = globalRows.find(candidate => candidate.id === editingCell.rowId);
    if (!row) {
      setEditingCell(null);
      return;
    }

    const trimmedValue = editingCell.value.trim();
    const isDeltaEdit = trimmedValue.startsWith('+') || trimmedValue.startsWith('-');
    const targetRows = getTargetRowsForEdit(row, editingCell.column);

    try {
      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
            const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetRow of targetRows) {
            const nextBeat = targetRow.absoluteStartBeat + parsed.deltaBeats;
            if (nextBeat < 0) {
              await showAlert(t('eventList.global.validation.position'));
              return;
            }
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'marker' || targetRow.type === 'chord') {
              KGCore.instance().executeCommand(new MoveGlobalRegionCommand(targetRow.id, Math.round(targetRow.absoluteStartBeat + parsed.deltaBeats)));
            } else if (targetRow.type === 'tempo') {
              KGCore.instance().executeCommand(new ResizeTempoRegionCommand(
                targetRow.id,
                'start',
                Math.round((targetRow.absoluteStartBeat + parsed.deltaBeats) / timeSignature.numerator)
              ));
            } else {
              KGCore.instance().executeCommand(new ResizeKeySignatureRegionCommand(
                targetRow.id,
                'start',
                Math.round((targetRow.absoluteStartBeat + parsed.deltaBeats) / timeSignature.numerator)
              ));
            }
          }
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }
          if (parsed.absoluteBeat < 0) {
            await showAlert(t('eventList.global.validation.position'));
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'marker' || targetRow.type === 'chord') {
              KGCore.instance().executeCommand(new MoveGlobalRegionCommand(targetRow.id, Math.round(parsed.absoluteBeat)));
            } else if (targetRow.type === 'tempo') {
              KGCore.instance().executeCommand(new ResizeTempoRegionCommand(
                targetRow.id,
                'start',
                Math.round(parsed.absoluteBeat / timeSignature.numerator)
              ));
            } else {
              KGCore.instance().executeCommand(new ResizeKeySignatureRegionCommand(
                targetRow.id,
                'start',
                Math.round(parsed.absoluteBeat / timeSignature.numerator)
              ));
            }
          }
        }
      }

      if (editingCell.column === 'val') {
        if (row.type === 'marker') {
          const normalized = trimmedValue.replace(/\r?\n/g, ' ').trim();
          if (!normalized) {
            await showAlert(buildValueValidationMessage('marker', t));
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'marker' && targetRow.region.getName() !== normalized) {
              KGCore.instance().executeCommand(new UpdateGlobalRegionTextCommand(targetRow.id, normalized));
            }
          }
        } else if (row.type === 'tempo') {
          if (!/^\d+$/.test(trimmedValue)) {
            await showAlert(buildValueValidationMessage('tempo', t));
            return;
          }
          const nextBpm = parseInt(trimmedValue, 10);
          if (
            Number.isNaN(nextBpm)
            || nextBpm <= TIME_CONSTANTS.MIN_BPM
            || nextBpm >= TIME_CONSTANTS.MAX_BPM
          ) {
            await showAlert(buildValueValidationMessage('tempo', t));
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'tempo' && targetRow.region.getBpm() !== nextBpm) {
              KGCore.instance().executeCommand(new UpdateTempoRegionCommand(targetRow.id, nextBpm));
            }
          }
        } else if (row.type === 'key-signature') {
          if (!CANONICAL_KEY_SIGNATURES.includes(trimmedValue as KeySignature)) {
            await showAlert(buildValueValidationMessage('key-signature', t));
            return;
          }
          const keySignature = trimmedValue as KeySignature;
          const changingKeyRows = targetRows.filter(
            (targetRow): targetRow is KeySignatureRowData => targetRow.type === 'key-signature'
              && targetRow.region.getKeySignature() !== keySignature,
          );
          const shouldAsk = changingKeyRows.some(targetRow => {
            const startBeat = targetRow.region.getStartFromBeat();
            return getKeySignatureTransposeDelta(targetRow.region.getKeySignature(), keySignature) !== 0
              && hasChordRegionsInTracks(globalTracks, {
                startBeat,
                endBeat: startBeat + targetRow.region.getLength(),
              });
          });
          const transposeChords = shouldAsk && await showConfirm(t('transpose.chords.confirmRange'), {
            confirmLabel: t('transpose.chords.transposeAction'),
            cancelLabel: t('transpose.chords.leaveAction'),
          });
          for (const targetRow of targetRows) {
            if (targetRow.type === 'key-signature' && targetRow.region.getKeySignature() !== keySignature) {
              try {
                KGCore.instance().executeCommand(
                  new UpdateKeySignatureRegionCommand(targetRow.id, keySignature, transposeChords),
                  { rethrow: true },
                );
              } catch (error) {
                await showAlert(t('transpose.error', { error: String(error) }));
                return;
              }
            }
          }
        } else if (parseChordSymbol(trimmedValue) === null) {
          await showAlert(buildValueValidationMessage('chord', t));
          return;
        } else {
          for (const targetRow of targetRows) {
            if (targetRow.type === 'chord' && targetRow.region.getSymbol() !== trimmedValue) {
              KGCore.instance().executeCommand(new UpdateChordRegionCommand(targetRow.id, trimmedValue));
            }
          }
        }
      }

      if (editingCell.column === 'length') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventLengthDelta(trimmedValue, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.durationBeats + parsed.deltaBeats <= 0) {
              await showAlert(t('eventList.global.validation.length'));
              return;
            }
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'marker' || targetRow.type === 'chord') {
              KGCore.instance().executeCommand(new ResizeGlobalRegionCommand(
                targetRow.id,
                'end',
                Math.round(targetRow.absoluteStartBeat + targetRow.durationBeats + parsed.deltaBeats)
              ));
            } else if (targetRow.type === 'tempo') {
              KGCore.instance().executeCommand(new ResizeTempoRegionCommand(
                targetRow.id,
                'end',
                Math.round((targetRow.absoluteStartBeat + targetRow.durationBeats + parsed.deltaBeats) / timeSignature.numerator)
              ));
            } else {
              KGCore.instance().executeCommand(new ResizeKeySignatureRegionCommand(
                targetRow.id,
                'end',
                Math.round((targetRow.absoluteStartBeat + targetRow.durationBeats + parsed.deltaBeats) / timeSignature.numerator)
              ));
            }
          }
        } else {
          const parsed = parseMidiEventLength(trimmedValue, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }
          if (parsed.duration <= 0) {
            await showAlert(t('eventList.global.validation.length'));
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.type === 'marker' || targetRow.type === 'chord') {
              KGCore.instance().executeCommand(new ResizeGlobalRegionCommand(
                targetRow.id,
                'end',
                Math.round(targetRow.absoluteStartBeat + parsed.duration)
              ));
            } else if (targetRow.type === 'tempo') {
              KGCore.instance().executeCommand(new ResizeTempoRegionCommand(
                targetRow.id,
                'end',
                Math.round((targetRow.absoluteStartBeat + parsed.duration) / timeSignature.numerator)
              ));
            } else {
              KGCore.instance().executeCommand(new ResizeKeySignatureRegionCommand(
                targetRow.id,
                'end',
                Math.round((targetRow.absoluteStartBeat + parsed.duration) / timeSignature.numerator)
              ));
            }
          }
        }
      }
    } catch (error) {
      console.error('Error editing global event list cell:', error);
    }

    refreshProjectState();
    setEditingCell(null);
  };

  const handleRowClick = (rowId: string, rowIndex: number, event: React.MouseEvent<HTMLTableRowElement>) => {
    event.stopPropagation();
    if (editingCell) return;

    const isModifierPressed = isModifierKeyPressed(event);
    const nextSelectedIds = new Set(selectedRowIdSet);
    const isAlreadySelected = selectedRowIdSet.has(rowId);
    const hasMultiSelection = selectedRowIdSet.size > 1;

    if (event.shiftKey) {
      clearPendingSingleClickSelection();
      const anchorIndex = globalRows.findIndex(row => row.id === rangeAnchorRowIdRef.current);
      const rangeStartIndex = anchorIndex >= 0 ? Math.min(anchorIndex, rowIndex) : rowIndex;
      const rangeEndIndex = anchorIndex >= 0 ? Math.max(anchorIndex, rowIndex) : rowIndex;

      if (!isModifierPressed) {
        nextSelectedIds.clear();
      }

      for (let index = rangeStartIndex; index <= rangeEndIndex; index += 1) {
        nextSelectedIds.add(globalRows[index].id);
      }
    } else if (isModifierPressed) {
      clearPendingSingleClickSelection();
      if (nextSelectedIds.has(rowId)) nextSelectedIds.delete(rowId);
      else nextSelectedIds.add(rowId);
      rangeAnchorRowIdRef.current = rowId;
    } else {
      if (isAlreadySelected && hasMultiSelection) {
        clearPendingSingleClickSelection();
        pendingSingleClickSelectionRef.current = window.setTimeout(() => {
          const delayedSelection = new Set<string>([rowId]);
          rangeAnchorRowIdRef.current = rowId;
          commitSelection(delayedSelection);
          pendingSingleClickSelectionRef.current = null;
        }, 220);
        return;
      }

      clearPendingSingleClickSelection();
      nextSelectedIds.clear();
      nextSelectedIds.add(rowId);
      rangeAnchorRowIdRef.current = rowId;
    }

    if (event.shiftKey && rangeAnchorRowIdRef.current === null) {
      rangeAnchorRowIdRef.current = rowId;
    }

    commitSelection(nextSelectedIds);
  };

  const handleTableBackgroundMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.target !== event.currentTarget) return;
    clearPendingSingleClickSelection();
    rangeAnchorRowIdRef.current = null;
    commitSelection(new Set());
  };

  const handleEditInputKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      await commitEditingCell();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      suppressBlurCommitRef.current = true;
      cancelEditingCell();
    }
  };

  const handleEditInputBlur = () => {
    if (suppressBlurCommitRef.current) {
      suppressBlurCommitRef.current = false;
      return;
    }

    void commitEditingCell();
  };

  const handleAddGlobalItem = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      if (addGlobalItemType === 'marker') {
        const startBeat = Math.max(0, Math.round(playheadPosition));
        const existing = markerRows.find(row => row.absoluteStartBeat === startBeat)?.region ?? null;
        if (existing) {
          selectCreatedOrExistingRegion(existing);
          refreshProjectState();
          return;
        }

        const command = new CreateGlobalMarkerRegionCommand(startBeat, timeSignature.numerator, 'Marker');
        KGCore.instance().executeCommand(command);
        const createdRegion = command.getCreatedRegion();
        if (createdRegion) {
          selectCreatedOrExistingRegion(createdRegion);
        }
      } else if (addGlobalItemType === 'tempo') {
        const startBar = Math.max(0, Math.round(playheadPosition / timeSignature.numerator));
        const existing = tempoRows.find(row => row.region.getStartBar() === startBar)?.region ?? null;
        if (existing) {
          selectCreatedOrExistingRegion(existing);
          refreshProjectState();
          return;
        }

        const command = new CreateTempoRegionCommand(startBar);
        KGCore.instance().executeCommand(command);
        const createdRegion = command.getCreatedRegion();
        if (createdRegion) {
          selectCreatedOrExistingRegion(createdRegion);
        }
      } else if (addGlobalItemType === 'key-signature') {
        const startBar = Math.max(0, Math.round(playheadPosition / timeSignature.numerator));
        const existing = keySignatureRows.find(row => row.region.getStartBar() === startBar)?.region ?? null;
        if (existing) {
          selectCreatedOrExistingRegion(existing);
          refreshProjectState();
          return;
        }

        const command = new CreateKeySignatureRegionCommand(startBar);
        KGCore.instance().executeCommand(command);
        const createdRegion = command.getCreatedRegion();
        if (createdRegion) {
          selectCreatedOrExistingRegion(createdRegion);
        }
      } else {
        const startBeat = Math.max(0, Math.round(playheadPosition));
        const exactRegion = chordRows.find(row => row.absoluteStartBeat === startBeat)?.region ?? null;
        if (exactRegion) {
          selectCreatedOrExistingRegion(exactRegion);
          refreshProjectState();
          return;
        }

        const occupiedRegion = chordRows.find(row => (
          startBeat > row.absoluteStartBeat && startBeat < row.absoluteStartBeat + row.durationBeats
        ))?.region ?? null;
        const command = occupiedRegion
          ? new InsertChordRegionAtBeatCommand(startBeat, 'C')
          : new CreateChordRegionCommand(startBeat, timeSignature.numerator, 'C');
        KGCore.instance().executeCommand(command);
        const createdRegion = command.getCreatedRegion();
        if (createdRegion) {
          selectCreatedOrExistingRegion(createdRegion);
        }
      }
    } catch (error) {
      console.error('Error adding global event list item:', error);
    }

    refreshProjectState();
  };

  const handleDeleteSelectedRows = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (visibleSelectedRows.length === 0) return;

    const markerIds = visibleSelectedRows.filter((row): row is MarkerRowData => row.type === 'marker').map(row => row.id);
    const chordIds = visibleSelectedRows.filter((row): row is ChordRowData => row.type === 'chord').map(row => row.id);
    const tempoIds = visibleSelectedRows.filter((row): row is TempoRowData => row.type === 'tempo').map(row => row.id);
    const keySignatureIds = visibleSelectedRows.filter((row): row is KeySignatureRowData => row.type === 'key-signature').map(row => row.id);

    if (markerIds.length > 0 || chordIds.length > 0) {
      KGCore.instance().executeCommand(new DeleteMultipleGlobalRegionsCommand([...markerIds, ...chordIds]));
    }
    if (tempoIds.length === 1) {
      KGCore.instance().executeCommand(new DeleteTempoRegionCommand(tempoIds[0]));
    } else if (tempoIds.length > 1) {
      KGCore.instance().executeCommand(new DeleteMultipleTempoRegionsCommand(tempoIds));
    }
    if (keySignatureIds.length === 1) {
      KGCore.instance().executeCommand(new DeleteKeySignatureRegionCommand(keySignatureIds[0]));
    } else if (keySignatureIds.length > 1) {
      KGCore.instance().executeCommand(new DeleteMultipleKeySignatureRegionsCommand(keySignatureIds));
    }

    rangeAnchorRowIdRef.current = null;
    refreshProjectState();
  };

  return (
    <>
      <div className="event-list-tabs" role="tablist" aria-label={t('eventList.global.filters')}>
        <button className={`event-list-tab${showMarkers ? ' active' : ''}`} aria-pressed={showMarkers} type="button" onClick={() => setShowMarkers(value => !value)}>{t('eventList.global.filter.marker')}</button>
        <button className={`event-list-tab${showTempo ? ' active' : ''}`} aria-pressed={showTempo} type="button" onClick={() => setShowTempo(value => !value)}>{t('eventList.global.filter.tempo')}</button>
        <button className={`event-list-tab${showKeySignature ? ' active' : ''}`} aria-pressed={showKeySignature} type="button" onClick={() => setShowKeySignature(value => !value)}>{t('eventList.global.filter.keySignature')}</button>
        <button className={`event-list-tab${showChords ? ' active' : ''}`} aria-pressed={showChords} type="button" onClick={() => setShowChords(value => !value)}>{t('eventList.global.filter.chord')}</button>
      </div>

      <div className="event-list-toolbar">
        <div className="event-list-toolbar-group">
          <button
            className="event-list-add-button"
            title={
              addGlobalItemType === 'marker'
                ? t('eventList.global.add.markerTitle')
                : addGlobalItemType === 'tempo'
                  ? t('eventList.global.add.tempoTitle')
                  : addGlobalItemType === 'key-signature'
                    ? t('eventList.global.add.keySignatureTitle')
                    : t('eventList.global.add.chordTitle')
            }
            type="button"
            onClick={handleAddGlobalItem}
          >
            <FaPlus />
          </button>
          <KGDropdown
            options={addGlobalItemOptions}
            value={addGlobalItemType}
            onChange={(value) => setAddGlobalItemType(value as AddGlobalItemType)}
            label={t('eventList.global.add.label')}
            buttonClassName="event-list-type-button"
            showValueAsLabel
          />
        </div>

        <div className="event-list-toolbar-group event-list-toolbar-group-right">
          <button
            className="event-list-delete-button"
            title={t('eventList.deleteVisibleSelectedRows')}
            type="button"
            onClick={handleDeleteSelectedRows}
            disabled={visibleSelectedRows.length === 0}
          >
            <FaTrash />
          </button>
        </div>
      </div>

      <div className="event-list-table-shell" onMouseDown={handleTableBackgroundMouseDown}>
        <EventListPlayhead
          rows={globalRows.map(row => ({
            id: row.id,
            beat: normalizeEventListPlayheadBeat(row.absoluteStartBeat, MIDI_EVENT_TICKS_PER_BEAT),
          }))}
          playheadPosition={playheadPosition}
          songEndBeat={maxBars * timeSignature.numerator}
        />
        <table className="event-list-table">
          <thead>
            <tr>
              <th>{t('eventList.table.position')}</th>
              <th>{t('eventList.table.status')}</th>
              <th>{t('eventList.table.val')}</th>
              <th>{t('eventList.table.lengthInfo')}</th>
            </tr>
          </thead>
          <tbody>
            {globalRows.map((row, index) => {
              const positionText = formatMidiEventPosition(row.absoluteStartBeat, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
              const statusText = getRowStatus(row, t);
              const valText = getRowValue(row);
              const lengthText = formatMidiEventLength(row.durationBeats, MIDI_EVENT_TICKS_PER_BEAT);
              const isEditingPosition = editingCell?.rowId === row.id && editingCell.column === 'position';
              const isEditingVal = editingCell?.rowId === row.id && editingCell.column === 'val';
              const isEditingLength = editingCell?.rowId === row.id && editingCell.column === 'length';

              return (
                <tr
                  key={row.id}
                  className={selectedRowIdSet.has(row.id) ? 'selected' : ''}
                  onClick={(event) => handleRowClick(row.id, index, event)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    clearPendingSingleClickSelection();
                  }}
                >
                  <td title={positionText} onDoubleClick={(event) => { event.stopPropagation(); startEditingCell(row.id, 'position', positionText); }}>
                    {isEditingPosition ? (
                      <input
                        ref={editInputRef}
                        className="event-list-cell-input"
                        value={editingCell.value}
                        onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                        onBlur={handleEditInputBlur}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                      />
                    ) : positionText}
                  </td>
                  <td title={statusText}>{statusText}</td>
                  <td title={valText} onDoubleClick={(event) => { event.stopPropagation(); startEditingCell(row.id, 'val', valText); }}>
                    {isEditingVal ? (
                      <input
                        ref={editInputRef}
                        className="event-list-cell-input"
                        value={editingCell.value}
                        onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                        onBlur={handleEditInputBlur}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                      />
                    ) : valText}
                  </td>
                  <td title={lengthText} onDoubleClick={(event) => { event.stopPropagation(); startEditingCell(row.id, 'length', lengthText); }}>
                    {isEditingLength ? (
                      <input
                        ref={editInputRef}
                        className="event-list-cell-input"
                        value={editingCell.value}
                        onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
                        onBlur={handleEditInputBlur}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => { void handleEditInputKeyDown(event); }}
                      />
                    ) : lengthText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default GlobalEventListTab;
