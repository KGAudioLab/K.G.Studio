import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGCore } from '../../core/KGCore';
import {
  CreateTrackAutomationPointsCommand,
  UpdateTrackAutomationPointsCommand,
} from '../../core/commands';
import { KGTrack } from '../../core/track/KGTrack';
import { KGTrackAutomationPoint, type TrackAutomationType } from '../../core/track/KGTrackAutomationPoint';
import { useProjectStore } from '../../stores/projectStore';
import { PIANO_ROLL_CONSTANTS } from '../../constants';
import { AUDIO_INTERFACE_CONSTANTS } from '../../constants/coreConstants';
import { isModifierKeyPressed } from '../../util/osUtil';
import { KGMainContentState } from '../../core/state/KGMainContentState';

interface TrackAutomationLaneProps {
  track: KGTrack;
  automationType: TrackAutomationType;
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  redrawVersion?: number;
}

interface SelectionBoxState {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface PreviewPoint {
  absoluteBeat: number;
  value: number;
}

const LANE_PADDING_Y = 12;
const POINT_RADIUS = 5;
const SELECTED_POINT_COLOR = '#FFFFFF';
const TRACK_AUTOMATION_COLORS: Record<TrackAutomationType, string> = {
  volume: '#87CEFA',
  pan: '#90EE90',
};

function formatAutomationValue(automationType: TrackAutomationType, value: number): string {
  if (automationType === 'volume') {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  }

  const magnitude = Math.round(Math.abs(value) * 100);
  if (magnitude === 0) {
    return 'C';
  }

  return `${value < 0 ? 'L' : 'R'}${magnitude}`;
}

const TrackAutomationLane: React.FC<TrackAutomationLaneProps> = ({
  track,
  automationType,
  maxBars,
  timeSignature,
  redrawVersion = 0,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const isLassoSelectingRef = useRef(false);
  const lassoShiftKeyRef = useRef(false);
  const selectionBoxRef = useRef<SelectionBoxState>({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const [selectionBoxRenderTick, setSelectionBoxRenderTick] = useState(0);
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const preventBackgroundClearRef = useRef(false);
  const [previewPoints, setPreviewPoints] = useState<Record<string, PreviewPoint>>({});
  const previewPointsRef = useRef<Record<string, PreviewPoint>>({});
  const dragStateRef = useRef<{
    originAbsoluteBeat: number;
    originValue: number;
    originClientX: number;
    originClientY: number;
    selectedPoints: KGTrackAutomationPoint[];
    minDeltaValue: number;
    maxDeltaValue: number;
    hasMoved: boolean;
  } | null>(null);

  const {
    selectedTrackAutomationPointIds,
    updateTrack,
    refreshProjectState,
    bumpTrackAutomationRedrawVersion,
  } = useProjectStore();

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.hasAttribute('data-chatbox-input') ||
        target.closest('.chatbox-input') !== null
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTypingTarget(event.target) && isModifierKeyPressed(event)) {
        setIsModifierPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isTypingTarget(event.target) && !isModifierKeyPressed(event)) {
        setIsModifierPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const points = useMemo(() => track.getAutomationPoints(automationType), [track, automationType, redrawVersion]);
  const selectedPointIdSet = new Set(selectedTrackAutomationPointIds.filter(id => points.some(point => point.getId() === id)));
  const pointMap = new Map(points.map(point => [point.getId(), point]));
  const totalBeats = maxBars * timeSignature.numerator;
  const barWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')) || 40;
  const beatWidth = barWidth / timeSignature.numerator;
  const minValue = automationType === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB : -1;
  const maxValue = automationType === 'volume' ? AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB : 1;

  const toY = (value: number): number => {
    const laneHeight = laneRef.current?.clientHeight ?? 120;
    const usableHeight = laneHeight - LANE_PADDING_Y * 2;
    const normalized = (value - minValue) / (maxValue - minValue);
    return laneHeight - LANE_PADDING_Y - normalized * usableHeight;
  };

  const toValue = (y: number): number => {
    const laneHeight = laneRef.current?.clientHeight ?? 120;
    const usableHeight = laneHeight - LANE_PADDING_Y * 2;
    const clampedY = Math.min(laneHeight - LANE_PADDING_Y, Math.max(LANE_PADDING_Y, y));
    const normalized = (laneHeight - LANE_PADDING_Y - clampedY) / usableHeight;
    const rawValue = minValue + normalized * (maxValue - minValue);
    return automationType === 'volume'
      ? Math.max(AUDIO_INTERFACE_CONSTANTS.MIN_TRACK_VOLUME_DB, Math.min(AUDIO_INTERFACE_CONSTANTS.MAX_TRACK_VOLUME_DB, rawValue))
      : Math.max(-1, Math.min(1, rawValue));
  };

  const renderedPoints = points.map(point => {
    const preview = previewPoints[point.getId()];
    const absoluteBeat = preview?.absoluteBeat ?? point.getBeat();
    const value = preview?.value ?? point.getValue();

    return {
      id: point.getId(),
      absoluteBeat,
      value,
      x: absoluteBeat * beatWidth,
      y: toY(value),
      isSelected: selectedPointIdSet.has(point.getId()),
    };
  }).sort((left, right) => left.absoluteBeat - right.absoluteBeat || left.id.localeCompare(right.id));

  const polylinePoints = renderedPoints.length > 0
    ? renderedPoints
      .concat([{ ...renderedPoints[renderedPoints.length - 1], id: `${renderedPoints[renderedPoints.length - 1].id}-tail`, x: beatWidth * totalBeats }])
      .map(point => `${point.x},${point.y}`)
      .join(' ')
    : '';

  const commitSelection = async (nextSelectedIds: Set<string>) => {
    points.forEach(point => {
      if (nextSelectedIds.has(point.getId())) {
        point.select();
      } else {
        point.deselect();
      }
    });

    const core = KGCore.instance();
    core.clearSelectedItems();
    const selectedPoints = points.filter(point => nextSelectedIds.has(point.getId()));
    if (selectedPoints.length > 0) {
      core.addSelectedItems(selectedPoints);
    }

    await updateTrack(track);
  };

  const getLaneCoordinates = (clientX: number, clientY: number) => {
    if (!laneRef.current) {
      return null;
    }

    const rect = laneRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const buildPreviewFromDrag = (clientX: number, clientY: number): Record<string, PreviewPoint> => {
    const dragState = dragStateRef.current;
    const coordinates = getLaneCoordinates(clientX, clientY);
    if (!dragState || !coordinates) {
      return {};
    }

    const rawAbsoluteBeat = coordinates.x / beatWidth;
    const beatDelta = rawAbsoluteBeat - dragState.originAbsoluteBeat;
    const rawDeltaValue = toValue(coordinates.y) - dragState.originValue;
    const valueDelta = Math.min(dragState.maxDeltaValue, Math.max(dragState.minDeltaValue, rawDeltaValue));
    const nextPreview: Record<string, PreviewPoint> = {};

    dragState.selectedPoints.forEach(point => {
      nextPreview[point.getId()] = {
        absoluteBeat: Math.max(0, point.getBeat() + beatDelta),
        value: point.getValue() + valueDelta,
      };
    });

    return nextPreview;
  };

  const applyPreviewPoints = (nextPreview: Record<string, PreviewPoint>) => {
    previewPointsRef.current = nextPreview;
    setPreviewPoints(nextPreview);
  };

  const handleDragMove = (event: MouseEvent) => {
    if (!dragStateRef.current) {
      return;
    }

    const dragState = dragStateRef.current;
    const movedX = Math.abs(event.clientX - dragState.originClientX);
    const movedY = Math.abs(event.clientY - dragState.originClientY);
    if (movedX >= PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD || movedY >= PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD) {
      dragState.hasMoved = true;
    }

    applyPreviewPoints(buildPreviewFromDrag(event.clientX, event.clientY));
  };

  const cleanupDragListeners = () => {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
  };

  const handleDragEnd = async () => {
    const dragState = dragStateRef.current;
    cleanupDragListeners();

    if (!dragState) {
      applyPreviewPoints({});
      return;
    }

    const pendingPreview = Object.keys(previewPointsRef.current).length > 0
      ? previewPointsRef.current
      : buildPreviewFromDrag(dragState.originClientX, dragState.originClientY);

    if (dragState.hasMoved && Object.keys(pendingPreview).length > 0) {
      KGCore.instance().executeCommand(new UpdateTrackAutomationPointsCommand(
        track.getId(),
        automationType,
        dragState.selectedPoints.map(point => ({
          pointId: point.getId(),
          beat: point.getBeat(),
          value: point.getValue(),
        })),
        dragState.selectedPoints.map(point => {
          const preview = pendingPreview[point.getId()];
          return {
            pointId: point.getId(),
            beat: preview.absoluteBeat,
            value: preview.value,
          };
        })
      ));
      bumpTrackAutomationRedrawVersion();
      await updateTrack(track);
      refreshProjectState();
      preventBackgroundClearRef.current = true;
    }

    dragStateRef.current = null;
    applyPreviewPoints({});
  };

  const handlePointMouseDown = async (pointId: string, event: React.MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const point = pointMap.get(pointId);
    if (!point) {
      return;
    }

    let nextSelection = new Set(selectedPointIdSet);
    if (event.shiftKey) {
      if (nextSelection.has(pointId)) {
        nextSelection.delete(pointId);
        await commitSelection(nextSelection);
        preventBackgroundClearRef.current = true;
        return;
      }

      nextSelection.add(pointId);
    } else if (!nextSelection.has(pointId)) {
      nextSelection = new Set([pointId]);
    }

    await commitSelection(nextSelection);

    const dragSelectedPoints = points.filter(candidate => nextSelection.has(candidate.getId()));
    const minDeltaValue = dragSelectedPoints.reduce((currentMin, candidate) => (
      Math.max(currentMin, minValue - candidate.getValue())
    ), Number.NEGATIVE_INFINITY);
    const maxDeltaValue = dragSelectedPoints.reduce((currentMax, candidate) => (
      Math.min(currentMax, maxValue - candidate.getValue())
    ), Number.POSITIVE_INFINITY);

    dragStateRef.current = {
      originAbsoluteBeat: point.getBeat(),
      originValue: point.getValue(),
      originClientX: event.clientX,
      originClientY: event.clientY,
      selectedPoints: dragSelectedPoints,
      minDeltaValue,
      maxDeltaValue,
      hasMoved: false,
    };

    applyPreviewPoints({});
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    preventBackgroundClearRef.current = true;
  };

  const handleLassoMouseMove = (event: MouseEvent) => {
    if (!isLassoSelectingRef.current || !laneRef.current) {
      return;
    }

    const rect = laneRef.current.getBoundingClientRect();
    selectionBoxRef.current = {
      ...selectionBoxRef.current,
      endX: event.clientX - rect.left,
      endY: event.clientY - rect.top,
    };
    setSelectionBoxRenderTick(tick => tick + 1);
  };

  const cleanupLassoListeners = () => {
    document.removeEventListener('mousemove', handleLassoMouseMove);
    document.removeEventListener('mouseup', handleLassoMouseUp);
  };

  const handleLassoMouseUp = async () => {
    cleanupLassoListeners();
    if (!isLassoSelectingRef.current) {
      return;
    }

    const { startX, startY, endX, endY } = selectionBoxRef.current;
    const left = Math.min(startX, endX);
    const right = Math.max(startX, endX);
    const top = Math.min(startY, endY);
    const bottom = Math.max(startY, endY);
    const isClick = (right - left < PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD)
      && (bottom - top < PIANO_ROLL_CONSTANTS.DRAG_THRESHOLD);

    isLassoSelectingRef.current = false;
    setSelectionBoxRenderTick(tick => tick + 1);

    if (isClick) {
      return;
    }

    let nextSelection = lassoShiftKeyRef.current ? new Set(selectedPointIdSet) : new Set<string>();
    renderedPoints.forEach(point => {
      const isIntersecting = (
        point.x + POINT_RADIUS >= left &&
        point.x - POINT_RADIUS <= right &&
        point.y + POINT_RADIUS >= top &&
        point.y - POINT_RADIUS <= bottom
      );
      if (!isIntersecting) {
        return;
      }

      if (lassoShiftKeyRef.current && nextSelection.has(point.id)) {
        nextSelection.delete(point.id);
      } else {
        nextSelection.add(point.id);
      }
    });

    await commitSelection(nextSelection);
    preventBackgroundClearRef.current = true;
  };

  const handleBackgroundMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isPointTarget(event.target) || dragStateRef.current) {
      return;
    }

    if (KGMainContentState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(event) || event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    selectionBoxRef.current = {
      startX: event.clientX - rect.left,
      startY: event.clientY - rect.top,
      endX: event.clientX - rect.left,
      endY: event.clientY - rect.top,
    };
    lassoShiftKeyRef.current = event.shiftKey;
    isLassoSelectingRef.current = true;
    setSelectionBoxRenderTick(tick => tick + 1);
    document.addEventListener('mousemove', handleLassoMouseMove);
    document.addEventListener('mouseup', handleLassoMouseUp);
  };

  const handleCreatePoint = async (clientX: number, clientY: number) => {
    const coordinates = getLaneCoordinates(clientX, clientY);
    if (!coordinates) {
      return;
    }

    KGCore.instance().executeCommand(new CreateTrackAutomationPointsCommand(track.getId(), automationType, [{
      beat: Math.max(0, coordinates.x / beatWidth),
      value: toValue(coordinates.y),
    }]));
    bumpTrackAutomationRedrawVersion();
    await updateTrack(track);
    refreshProjectState();
    preventBackgroundClearRef.current = true;
  };

  const handleBackgroundClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (isPointTarget(event.target)) {
      return;
    }

    if (preventBackgroundClearRef.current) {
      preventBackgroundClearRef.current = false;
      return;
    }

    if (KGMainContentState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(event)) {
      if (event.detail > 1) {
        return;
      }
      await handleCreatePoint(event.clientX, event.clientY);
      return;
    }

    if (isLassoSelectingRef.current) {
      return;
    }

    await commitSelection(new Set());
  };

  const handleBackgroundDoubleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isPointTarget(event.target)) {
      await handleCreatePoint(event.clientX, event.clientY);
    }
  };

  useEffect(() => {
    return () => {
      cleanupDragListeners();
      cleanupLassoListeners();
    };
  }, []);

  const selectionBoxStyle = {
    left: `${Math.min(selectionBoxRef.current.startX, selectionBoxRef.current.endX)}px`,
    top: `${Math.min(selectionBoxRef.current.startY, selectionBoxRef.current.endY)}px`,
    width: `${Math.abs(selectionBoxRef.current.endX - selectionBoxRef.current.startX)}px`,
    height: `${Math.abs(selectionBoxRef.current.endY - selectionBoxRef.current.startY)}px`,
  };

  const isPointTarget = (target: EventTarget | null): boolean => (
    target instanceof Element && target.closest('.track-automation-point') !== null
  );

  return (
    <div
      ref={laneRef}
      className={`track-automation-lane ${isModifierPressed ? 'pencil-cursor' : ''}`}
      aria-label={`${automationType} track automation lane`}
      onMouseDown={handleBackgroundMouseDown}
      onClick={(event) => { void handleBackgroundClick(event); }}
      onDoubleClick={(event) => { void handleBackgroundDoubleClick(event); }}
    >
      <div className="track-automation-overlay" />
      <svg
        className="track-automation-svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${beatWidth * totalBeats} ${laneRef.current?.clientHeight ?? 120}`}
        preserveAspectRatio="none"
      >
        {renderedPoints.length > 0 && (
          <polyline
            className="track-automation-line"
            fill="none"
            stroke={TRACK_AUTOMATION_COLORS[automationType]}
            strokeWidth="2"
            points={polylinePoints}
          />
        )}
        {renderedPoints.map(point => (
          <g key={point.id}>
            <circle
              className={`track-automation-point${point.isSelected ? ' selected' : ''}`}
              cx={point.x}
              cy={point.y}
              r={POINT_RADIUS}
              fill={point.isSelected ? SELECTED_POINT_COLOR : TRACK_AUTOMATION_COLORS[automationType]}
              stroke={point.isSelected ? SELECTED_POINT_COLOR : '#1d2428'}
              strokeWidth={point.isSelected ? 3 : 2}
              onMouseDown={(event) => { void handlePointMouseDown(point.id, event); }}
            />
            <text
              className="track-automation-value"
              x={point.x + 8}
              y={Math.max(14, point.y - 8)}
              fill={point.isSelected ? SELECTED_POINT_COLOR : TRACK_AUTOMATION_COLORS[automationType]}
            >
              {formatAutomationValue(automationType, point.value)}
            </text>
          </g>
        ))}
      </svg>
      {isLassoSelectingRef.current && (
        <div
          key={selectionBoxRenderTick}
          className="track-automation-selection-box"
          style={selectionBoxStyle}
        />
      )}
    </div>
  );
};

export default TrackAutomationLane;
