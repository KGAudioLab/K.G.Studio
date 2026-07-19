import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import KGDropdown from '../common/KGDropdown';
import { useProjectStore } from '../../stores/projectStore';
import { KGCore } from '../../core/KGCore';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { KGRegion } from '../../core/region/KGRegion';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../../core/track/KGTrackAutomationPoint';
import { KGMidiTrack } from '../../core/track/KGMidiTrack';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import {
  CreateRegionCommand,
  CreateTrackAutomationPointsCommand,
  DeleteMultipleRegionsCommand,
  DeleteTrackAutomationPointsCommand,
  MoveRegionCommand,
  ResizeRegionCommand,
  UpdateTrackAutomationPointsCommand,
} from '../../core/commands';
import {
  formatMidiEventLength,
  formatMidiEventPosition,
  MIDI_EVENT_TICKS_PER_BEAT,
  parseMidiEventLengthDelta,
  parseMidiEventLength,
  parseMidiEventPositionDelta,
  parseMidiEventPosition,
} from '../../util/midiUtil';
import { isModifierKeyPressed } from '../../util/osUtil';
import { showAlert } from '../../util/dialogUtil';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { useI18n } from '../../i18n/useI18n';
import EventListPlayhead from './EventListPlayhead';
import { normalizeEventListPlayheadBeat } from './eventListPlayheadUtil';

interface TrackEventListTabProps {
  selectedTrack: KGMidiTrack | KGAudioTrack | null;
}

type AddTrackItemType = 'midi-region' | 'volume' | 'pan';
type TrackEditableColumn = 'position' | 'val' | 'length';

interface TrackRegionRowData {
  id: string;
  type: 'region';
  region: KGRegion;
  absoluteStartBeat: number;
  durationBeats: number;
  statusLabel: 'MIDI' | 'Audio';
}

interface TrackAutomationRowData {
  id: string;
  type: 'automation';
  automationType: TrackAutomationType;
  point: KGTrackAutomationPoint;
  absoluteBeat: number;
}

type TrackRowData = TrackRegionRowData | TrackAutomationRowData;

interface TrackEditingCell {
  rowId: string;
  column: TrackEditableColumn;
  value: string;
}

const formatTrackAutomationValue = (automationType: TrackAutomationType, value: number): string => {
  if (automationType === 'volume') {
    if (value <= AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB) {
      return '−∞';
    }

    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}dB`;
  }

  const logicPanValue = value <= 0 ? Math.round(value * 64) : Math.round(value * 63);
  return `${logicPanValue >= 0 ? '+' : ''}${logicPanValue}`;
};

const formatTrackAutomationInfo = (automationType: TrackAutomationType, value: number): string => {
  return automationType === 'volume' ? `Raw ${value.toFixed(3)} dB` : `Raw ${value.toFixed(3)}`;
};

const parseTrackAutomationValueInput = (
  automationType: TrackAutomationType,
  raw: string
): { value: number } | { error: string } => {
  const trimmed = raw.trim().replace(/db$/i, '');

  if (automationType === 'volume') {
    if (trimmed === '−∞' || trimmed.toLowerCase() === '-inf' || trimmed.toLowerCase() === '-infinity') {
      return { value: AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB };
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { error: `Volume must be a number between ${AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB} and ${AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB}.` };
    }
    if (parsed < AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB || parsed > AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB) {
      return { error: `Volume must be between ${AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB} and ${AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB}.` };
    }
    return { value: parsed };
  }

  if (!/^[+-]?\d+$/.test(trimmed)) {
    return { error: 'Pan must be an integer between -64 and +63.' };
  }

  const parsed = parseInt(trimmed, 10);
  if (parsed < -64 || parsed > 63) {
    return { error: 'Pan must be between -64 and +63.' };
  }

  const normalized = parsed <= 0 ? parsed / 64 : parsed / 63;
  return { value: Math.max(-1, Math.min(1, normalized)) };
};

const findPreviousPanValue = (points: KGTrackAutomationPoint[], beat: number): number => {
  const previousPoint = [...points].filter(point => point.getBeat() <= beat).sort((a, b) => b.getBeat() - a.getBeat())[0];
  return previousPoint?.getValue() ?? 0;
};

const TrackEventListTab: React.FC<TrackEventListTabProps> = ({ selectedTrack }) => {
  const { t } = useI18n();
  const {
    tracks,
    maxBars,
    playheadPosition,
    timeSignature,
    selectedRegionIds,
    selectedTrackAutomationPointIds,
    updateTrack,
    refreshProjectState,
    bumpTrackAutomationRedrawVersion,
  } = useProjectStore();

  const [showRegions, setShowRegions] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [showPan, setShowPan] = useState(true);
  const [addTrackItemType, setAddTrackItemType] = useState<AddTrackItemType>('midi-region');
  const [editingCell, setEditingCell] = useState<TrackEditingCell | null>(null);
  const rangeAnchorRowIdRef = useRef<string | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const pendingSingleClickSelectionRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedTrack instanceof KGAudioTrack && addTrackItemType === 'midi-region') {
      setAddTrackItemType('volume');
    }
  }, [selectedTrack, addTrackItemType]);

  useEffect(() => {
    if (editingCell) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingCell?.rowId, editingCell?.column]);

  useEffect(() => {
    return () => {
      if (pendingSingleClickSelectionRef.current !== null) {
        window.clearTimeout(pendingSingleClickSelectionRef.current);
      }
    };
  }, []);

  const availableAddOptions = useMemo(() => {
    const options: Array<{ label: string; value: AddTrackItemType }> = [];
    if (selectedTrack instanceof KGMidiTrack) {
      options.push({ label: t('eventList.track.addType.midiRegion'), value: 'midi-region' });
    }
    options.push({ label: t('eventList.track.filter.volume'), value: 'volume' });
    options.push({ label: t('eventList.track.filter.pan'), value: 'pan' });
    return options;
  }, [selectedTrack, t]);

  const liveSelectedTrack = useMemo(() => {
    if (!selectedTrack) {
      return null;
    }

    const matchedTrack = tracks.find(track => track.getId() === selectedTrack.getId()) ?? null;
    return matchedTrack instanceof KGMidiTrack || matchedTrack instanceof KGAudioTrack
      ? matchedTrack
      : selectedTrack;
  }, [selectedTrack, tracks]);

  const trackRows: TrackRowData[] = useMemo(() => {
    if (!liveSelectedTrack) return [];

    const regionRows: TrackRegionRowData[] = showRegions
      ? liveSelectedTrack.getRegions().map(region => ({
        id: region.getId(),
        type: 'region',
        region,
        absoluteStartBeat: region.getStartFromBeat(),
        durationBeats: region.getLength(),
        statusLabel: region instanceof KGAudioRegion ? 'Audio' : 'MIDI',
      }))
      : [];

    const volumeRows: TrackAutomationRowData[] = showVolume
      ? liveSelectedTrack.getAutomationPoints('volume').map(point => ({
        id: point.getId(),
        type: 'automation',
        automationType: 'volume',
        point,
        absoluteBeat: point.getBeat(),
      }))
      : [];

    const panRows: TrackAutomationRowData[] = showPan
      ? liveSelectedTrack.getAutomationPoints('pan').map(point => ({
        id: point.getId(),
        type: 'automation',
        automationType: 'pan',
        point,
        absoluteBeat: point.getBeat(),
      }))
      : [];

    return [...regionRows, ...volumeRows, ...panRows].sort((a, b) => {
      const beatA = a.type === 'region' ? a.absoluteStartBeat : a.absoluteBeat;
      const beatB = b.type === 'region' ? b.absoluteStartBeat : b.absoluteBeat;
      if (beatA !== beatB) return beatA - beatB;
      if (a.type !== b.type) return a.type === 'region' ? -1 : 1;
      if (a.type === 'automation' && b.type === 'automation' && a.automationType !== b.automationType) {
        return a.automationType.localeCompare(b.automationType);
      }
      return a.id.localeCompare(b.id);
    });
  }, [liveSelectedTrack, showPan, showRegions, showVolume, tracks]);

  const selectedRowIdSet = new Set([...selectedRegionIds, ...selectedTrackAutomationPointIds]);
  const visibleSelectedRows = trackRows.filter(row => selectedRowIdSet.has(row.id));

  const clearPendingSingleClickSelection = () => {
    if (pendingSingleClickSelectionRef.current !== null) {
      window.clearTimeout(pendingSingleClickSelectionRef.current);
      pendingSingleClickSelectionRef.current = null;
    }
  };

  const commitTrackRegionSelection = (nextSelectedIds: Set<string>) => {
    if (!liveSelectedTrack) return;

    const core = KGCore.instance();
    const selectedRegions = liveSelectedTrack.getRegions().filter(region => nextSelectedIds.has(region.getId()));
    const previouslySelectedRegions = core.getSelectedItems().filter(item => item instanceof KGRegion);

    liveSelectedTrack.getRegions().forEach(region => {
      if (nextSelectedIds.has(region.getId())) region.select();
      else region.deselect();
    });

    if (previouslySelectedRegions.length > 0) {
      core.removeSelectedItems(previouslySelectedRegions);
    }
    if (selectedRegions.length > 0) {
      core.addSelectedItems(selectedRegions);
    }

    void updateTrack(liveSelectedTrack);
  };

  const commitTrackAutomationSelection = (nextSelectedIds: Set<string>) => {
    if (!liveSelectedTrack) return;

    const core = KGCore.instance();
    const points = [
      ...liveSelectedTrack.getAutomationPoints('volume'),
      ...liveSelectedTrack.getAutomationPoints('pan'),
    ];
    const selectedPoints = points.filter(point => nextSelectedIds.has(point.getId()));
    const previouslySelectedPoints = core.getSelectedItems().filter(item => item instanceof KGTrackAutomationPoint);

    points.forEach(point => {
      if (nextSelectedIds.has(point.getId())) point.select();
      else point.deselect();
    });

    if (previouslySelectedPoints.length > 0) {
      core.removeSelectedItems(previouslySelectedPoints);
    }
    if (selectedPoints.length > 0) {
      core.addSelectedItems(selectedPoints);
    }

    void updateTrack(liveSelectedTrack);
  };

  const commitSelection = (nextSelectedIds: Set<string>) => {
    commitTrackRegionSelection(nextSelectedIds);
    commitTrackAutomationSelection(nextSelectedIds);
  };

  const startEditingCell = (rowId: string, column: TrackEditableColumn, value: string) => {
    clearPendingSingleClickSelection();
    setEditingCell({ rowId, column, value });
  };

  const cancelEditingCell = () => {
    setEditingCell(null);
  };

  const commitEditingCell = async () => {
    if (!editingCell || !liveSelectedTrack) return;

    const row = trackRows.find(candidate => candidate.id === editingCell.rowId);
    if (!row) {
      setEditingCell(null);
      return;
    }

    const trimmedValue = editingCell.value.trim();
    const isDeltaEdit = trimmedValue.startsWith('+') || trimmedValue.startsWith('-');

    if (row.type === 'region') {
      const targetRows: TrackRegionRowData[] = selectedRowIdSet.has(row.id) && selectedRegionIds.length > 1
        ? trackRows.filter((candidate): candidate is TrackRegionRowData => candidate.type === 'region' && selectedRowIdSet.has(candidate.id))
        : [row];

      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetRow of targetRows) {
            if (targetRow.region.getStartFromBeat() + parsed.deltaBeats < 0) {
              await showAlert('Position delta would move one or more regions before the start of the project.');
              return;
            }
          }

          targetRows.forEach(targetRow => {
            KGCore.instance().executeCommand(new MoveRegionCommand(
              targetRow.region.getId(),
              targetRow.region.getStartFromBeat() + parsed.deltaBeats,
              targetRow.region.getTrackId(),
              targetRow.region.getTrackIndex()
            ));
          });
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }
          if (parsed.absoluteBeat < 0) {
            await showAlert('Position cannot be earlier than the start of the project.');
            return;
          }

          targetRows.forEach(targetRow => {
            KGCore.instance().executeCommand(new MoveRegionCommand(
              targetRow.region.getId(),
              parsed.absoluteBeat,
              targetRow.region.getTrackId(),
              targetRow.region.getTrackIndex()
            ));
          });
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
            if (targetRow.region.getLength() + parsed.deltaBeats <= 0) {
              await showAlert('Length delta would make one or more regions non-positive in duration.');
              return;
            }
          }

          targetRows.forEach(targetRow => {
            KGCore.instance().executeCommand(new ResizeRegionCommand(
              targetRow.region.getId(),
              targetRow.region.getStartFromBeat(),
              targetRow.region.getLength() + parsed.deltaBeats
            ));
          });
        } else {
          const parsed = parseMidiEventLength(trimmedValue, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }
          if (parsed.duration <= 0) {
            await showAlert('Length must be positive.');
            return;
          }

          targetRows.forEach(targetRow => {
            KGCore.instance().executeCommand(new ResizeRegionCommand(
              targetRow.region.getId(),
              targetRow.region.getStartFromBeat(),
              parsed.duration
            ));
          });
        }
      }
    } else {
      const automationType = row.automationType;
      const targetRows: TrackAutomationRowData[] = selectedRowIdSet.has(row.id) && selectedTrackAutomationPointIds.length > 1
        ? trackRows.filter((candidate): candidate is TrackAutomationRowData => (
          candidate.type === 'automation'
          && candidate.automationType === automationType
          && selectedRowIdSet.has(candidate.id)
        ))
        : [row];

      const snapshots = targetRows.map(targetRow => ({
        pointId: targetRow.point.getId(),
        beat: targetRow.point.getBeat(),
        value: targetRow.point.getValue(),
      }));
      const updates: Array<{ pointId: string; beat?: number; value?: number }> = [];

      if (editingCell.column === 'position') {
        if (isDeltaEdit) {
          const parsed = parseMidiEventPositionDelta(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }

          for (const targetRow of targetRows) {
            const nextBeat = targetRow.point.getBeat() + parsed.deltaBeats;
            if (nextBeat < 0) {
              await showAlert('Position delta would move one or more automation points before the start of the project.');
              return;
            }
            updates.push({ pointId: targetRow.point.getId(), beat: nextBeat });
          }
        } else {
          const parsed = parseMidiEventPosition(trimmedValue, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
          if ('error' in parsed) {
            await showAlert(parsed.error);
            return;
          }
          if (parsed.absoluteBeat < 0) {
            await showAlert('Position cannot be earlier than the start of the project.');
            return;
          }

          for (const targetRow of targetRows) {
            updates.push({ pointId: targetRow.point.getId(), beat: parsed.absoluteBeat });
          }
        }
      }

      if (editingCell.column === 'val') {
        const parsed = parseTrackAutomationValueInput(automationType, trimmedValue);
        if ('error' in parsed) {
          await showAlert(parsed.error);
          return;
        }
        for (const targetRow of targetRows) {
          updates.push({ pointId: targetRow.point.getId(), value: parsed.value });
        }
      }

      if (updates.length > 0) {
        KGCore.instance().executeCommand(new UpdateTrackAutomationPointsCommand(
          liveSelectedTrack.getId(),
          automationType,
          snapshots,
          updates
        ));
        bumpTrackAutomationRedrawVersion();
      }
    }

    await updateTrack(liveSelectedTrack);
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
      const anchorIndex = trackRows.findIndex(row => row.id === rangeAnchorRowIdRef.current);
      const rangeStartIndex = anchorIndex >= 0 ? Math.min(anchorIndex, rowIndex) : rowIndex;
      const rangeEndIndex = anchorIndex >= 0 ? Math.max(anchorIndex, rowIndex) : rowIndex;

      if (!isModifierPressed) {
        nextSelectedIds.clear();
      }

      for (let index = rangeStartIndex; index <= rangeEndIndex; index += 1) {
        nextSelectedIds.add(trackRows[index].id);
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

  const handleAddTrackItem = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!liveSelectedTrack) return;

    if (addTrackItemType === 'midi-region') {
      if (!(liveSelectedTrack instanceof KGMidiTrack)) return;

      const command = new CreateRegionCommand(
        liveSelectedTrack.getId().toString(),
        liveSelectedTrack.getTrackIndex(),
        playheadPosition,
        timeSignature.numerator
      );
      KGCore.instance().executeCommand(command);
      const createdRegion = command.getCreatedRegion();
      if (createdRegion) {
        KGCore.instance().clearSelectedItems();
        createdRegion.select();
        KGCore.instance().addSelectedItem(createdRegion);
        rangeAnchorRowIdRef.current = createdRegion.getId();
      }
    } else {
      const automationType: TrackAutomationType = addTrackItemType;
      const value = automationType === 'volume'
        ? liveSelectedTrack.getVolume()
        : findPreviousPanValue(liveSelectedTrack.getPanAutomation(), playheadPosition);

      const command = new CreateTrackAutomationPointsCommand(
        liveSelectedTrack.getId(),
        automationType,
        [{ beat: playheadPosition, value }]
      );
      KGCore.instance().executeCommand(command);
      const createdPointId = command.getCreatedPointIds()[0];
      const createdPoint = createdPointId
        ? liveSelectedTrack.getAutomationPoints(automationType).find(point => point.getId() === createdPointId) ?? null
        : null;
      if (createdPoint) {
        KGCore.instance().clearSelectedItems();
        createdPoint.select();
        KGCore.instance().addSelectedItem(createdPoint);
        rangeAnchorRowIdRef.current = createdPoint.getId();
      }
      bumpTrackAutomationRedrawVersion();
    }

    await updateTrack(liveSelectedTrack);
    refreshProjectState();
  };

  const handleDeleteSelectedRows = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!liveSelectedTrack || visibleSelectedRows.length === 0) return;

    const regionIds = visibleSelectedRows
      .filter((row): row is TrackRegionRowData => row.type === 'region')
      .map(row => row.region.getId());
    const volumePointIds = visibleSelectedRows
      .filter((row): row is TrackAutomationRowData => row.type === 'automation' && row.automationType === 'volume')
      .map(row => row.point.getId());
    const panPointIds = visibleSelectedRows
      .filter((row): row is TrackAutomationRowData => row.type === 'automation' && row.automationType === 'pan')
      .map(row => row.point.getId());

    if (regionIds.length > 0) {
      KGCore.instance().executeCommand(new DeleteMultipleRegionsCommand(
        regionIds
      ));
    }
    if (volumePointIds.length > 0) {
      KGCore.instance().executeCommand(new DeleteTrackAutomationPointsCommand(
        liveSelectedTrack.getId(),
        'volume',
        volumePointIds
      ));
    }
    if (panPointIds.length > 0) {
      KGCore.instance().executeCommand(new DeleteTrackAutomationPointsCommand(
        liveSelectedTrack.getId(),
        'pan',
        panPointIds
      ));
    }
    if (volumePointIds.length > 0 || panPointIds.length > 0) {
      bumpTrackAutomationRedrawVersion();
    }

    rangeAnchorRowIdRef.current = null;
    await updateTrack(liveSelectedTrack);
    refreshProjectState();
  };

  return (
    <>
      <div className="event-list-tabs" role="tablist" aria-label={t('eventList.track.filters')}>
        <button className={`event-list-tab${showRegions ? ' active' : ''}`} aria-pressed={showRegions} type="button" onClick={() => setShowRegions(value => !value)}>{t('eventList.track.filter.regions')}</button>
        <button className={`event-list-tab${showVolume ? ' active' : ''}`} aria-pressed={showVolume} type="button" onClick={() => setShowVolume(value => !value)}>{t('eventList.track.filter.volume')}</button>
        <button className={`event-list-tab${showPan ? ' active' : ''}`} aria-pressed={showPan} type="button" onClick={() => setShowPan(value => !value)}>{t('eventList.track.filter.pan')}</button>
      </div>

      {!liveSelectedTrack ? (
        <div className="event-list-empty-state">
          {t('eventList.track.empty')}
        </div>
      ) : (
        <>
          <div className="event-list-toolbar">
            <div className="event-list-toolbar-group">
              <button
                className="event-list-add-button"
                title={
                  addTrackItemType === 'midi-region'
                    ? t('eventList.track.add.midiRegionTitle')
                    : addTrackItemType === 'volume'
                      ? t('eventList.track.add.volumeTitle')
                      : t('eventList.track.add.panTitle')
                }
                type="button"
                onClick={handleAddTrackItem}
              >
                <FaPlus />
              </button>
              <KGDropdown
                options={availableAddOptions}
                value={addTrackItemType}
                onChange={(value) => setAddTrackItemType(value as AddTrackItemType)}
                label={t('eventList.track.add.label')}
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
              rows={trackRows.map(row => ({
                id: row.id,
                beat: normalizeEventListPlayheadBeat(
                  row.type === 'region' ? row.absoluteStartBeat : row.absoluteBeat,
                  MIDI_EVENT_TICKS_PER_BEAT,
                ),
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
                {trackRows.map((row, index) => {
                  const positionText = formatMidiEventPosition(row.type === 'region' ? row.absoluteStartBeat : row.absoluteBeat, timeSignature, MIDI_EVENT_TICKS_PER_BEAT);
                  const statusText = row.type === 'region'
                    ? (row.statusLabel === 'Audio' ? t('eventList.track.status.audio') : t('eventList.track.status.midi'))
                    : row.automationType === 'volume'
                      ? t('eventList.track.status.volume')
                      : t('eventList.track.status.pan');
                  const valText = row.type === 'region' ? row.region.getName() : formatTrackAutomationValue(row.automationType, row.point.getValue());
                  const infoText = row.type === 'region' ? formatMidiEventLength(row.durationBeats, MIDI_EVENT_TICKS_PER_BEAT) : formatTrackAutomationInfo(row.automationType, row.point.getValue());
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
                      <td title={valText} onDoubleClick={(event) => {
                        if (row.type === 'region') return;
                        event.stopPropagation();
                        startEditingCell(row.id, 'val', valText);
                      }}>
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
                      <td title={infoText} onDoubleClick={(event) => {
                        if (row.type !== 'region') return;
                        event.stopPropagation();
                        startEditingCell(row.id, 'length', infoText);
                      }}>
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
                        ) : infoText}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

export default TrackEventListTab;
