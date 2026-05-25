import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGCore } from '../../core/KGCore';
import { CreateMidiEventsCommand } from '../../core/commands/note/CreateMidiEventsCommand';
import { UpdateControllerEventPropertiesCommand } from '../../core/commands/note/UpdateControllerEventPropertiesCommand';
import { UpdatePitchBendPropertiesCommand } from '../../core/commands/note/UpdatePitchBendPropertiesCommand';
import { KGMidiControllerEvent } from '../../core/midi/KGMidiControllerEvent';
import { KGMidiPitchBend } from '../../core/midi/KGMidiPitchBend';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import {
  MIDI_PITCH_BEND_MAX,
  MIDI_PITCH_BEND_MIN,
  clampMidiControllerValue,
  clampMidiPitchBendValue,
  midiPitchBendToSignedValue,
} from '../../util/midiUtil';
import { isModifierKeyPressed } from '../../util/osUtil';
import { useProjectStore } from '../../stores/projectStore';
import { PIANO_ROLL_CONSTANTS } from '../../constants';
import { getSnappedBeatPosition } from './pianoRollSnap';
import {
  getAutomationInterpolationMode,
  getControllerNumberForAutomationType,
  PIANO_ROLL_AUTOMATION_OPTIONS,
  type PianoRollAutomationType,
} from './pianoRollAutomation';

interface AutomationPoint {
  id: string;
  kind: 'pitch-bend' | 'controller';
  controller: number | null;
  relativeBeat: number;
  absoluteBeat: number;
  value: number;
  label: string;
}

interface PianoRollAutomationLaneProps {
  activeRegion: KGMidiRegion | null;
  automationType: PianoRollAutomationType;
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  bpm?: number;
  redrawVersion?: number;
  horizontalScrollLeft?: number;
  onHorizontalWheel?: (delta: number) => void;
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

const AUTOMATION_COLOR = '#87CEFA';
const SELECTED_POINT_COLOR = '#FFFFFF';
const LANE_PADDING_Y = 16;
const MIN_LANE_HEIGHT = 160;
const POINT_RADIUS = 5;

const PianoRollAutomationLane: React.FC<PianoRollAutomationLaneProps> = ({
  activeRegion,
  automationType,
  maxBars,
  timeSignature,
  redrawVersion = 0,
  horizontalScrollLeft = 0,
  onHorizontalWheel,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const isLassoSelectingRef = useRef(false);
  const lassoShiftKeyRef = useRef(false);
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const selectionBoxRef = useRef<SelectionBoxState>({ startX: 0, startY: 0, endX: 0, endY: 0 });
  const [selectionBoxRenderTick, setSelectionBoxRenderTick] = useState(0);
  const preventBackgroundClearRef = useRef(false);
  const dragStateRef = useRef<{
    primaryPointId: string;
    originAbsoluteBeat: number;
    originValue: number;
    originClientX: number;
    originClientY: number;
    selectedPoints: AutomationPoint[];
    minDeltaValue: number;
    maxDeltaValue: number;
    hasMoved: boolean;
  } | null>(null);
  const [previewPoints, setPreviewPoints] = useState<Record<string, PreviewPoint>>({});
  const previewPointsRef = useRef<Record<string, PreviewPoint>>({});
  const [laneHeight, setLaneHeight] = useState(MIN_LANE_HEIGHT);
  const beatWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')) || 40;
  const keyWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')) || 60;

  const {
    tracks,
    updateTrack,
    refreshProjectState,
    bumpAutomationRedrawVersion,
    selectedPitchBendIds,
    selectedControllerEventIds,
  } = useProjectStore();

  useEffect(() => {
    const element = laneRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setLaneHeight(Math.max(Math.round(element.clientHeight), MIN_LANE_HEIGHT));
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = laneRef.current;
    if (!element) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : (event.shiftKey ? event.deltaY : 0);
      if (horizontalDelta === 0) {
        return;
      }

      event.preventDefault();
      onHorizontalWheel?.(horizontalDelta);
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [onHorizontalWheel]);

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
      if (isTypingTarget(event.target)) {
        return;
      }

      if (isModifierKeyPressed(event)) {
        setIsModifierPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (!isModifierKeyPressed(event)) {
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

  const points = useMemo<AutomationPoint[]>(() => {
    if (!activeRegion) {
      return [];
    }

    const regionStartBeat = activeRegion.getStartFromBeat();
    if (automationType === 'pitch-bend') {
      return activeRegion.getPitchBends().map((pitchBend) => ({
        id: pitchBend.getId(),
        kind: 'pitch-bend' as const,
        controller: null,
        relativeBeat: pitchBend.getBeat(),
        absoluteBeat: regionStartBeat + pitchBend.getBeat(),
        value: pitchBend.getValue(),
        label: `${midiPitchBendToSignedValue(pitchBend.getValue())}`,
      }));
    }

    const controller = getControllerNumberForAutomationType(automationType);
    if (controller === null) {
      return [];
    }

    return activeRegion.getControllerEvents(controller).map((event) => ({
      id: event.getId(),
      kind: 'controller' as const,
      controller,
      relativeBeat: event.getBeat(),
      absoluteBeat: regionStartBeat + event.getBeat(),
      value: event.getValue(),
      label: `${event.getValue()}`,
    }));
  }, [activeRegion, automationType, redrawVersion]);

  const selectedPointIds = automationType === 'pitch-bend'
    ? selectedPitchBendIds
    : selectedControllerEventIds.filter(id => points.some(point => point.id === id));
  const selectedPointIdSet = new Set(selectedPointIds);
  const pointMap = new Map(points.map(point => [point.id, point]));
  const parentTrack = activeRegion
    ? tracks.find(track => track.getId().toString() === activeRegion.getTrackId()) ?? null
    : null;

  const selectedOption = PIANO_ROLL_AUTOMATION_OPTIONS.find(option => option.value === automationType);
  const laneLabel = selectedOption?.label ?? automationType;
  const interpolationMode = getAutomationInterpolationMode(automationType);
  const totalBeats = maxBars * timeSignature.numerator;
  const totalWidth = 'calc(var(--max-number-of-bars) * var(--region-grid-bar-width) + var(--region-piano-key-width))';
  const minValue = automationType === 'pitch-bend' ? MIDI_PITCH_BEND_MIN : 0;
  const maxValue = automationType === 'pitch-bend' ? MIDI_PITCH_BEND_MAX : 127;

  const toY = (value: number): number => {
    const usableHeight = laneHeight - LANE_PADDING_Y * 2;
    const normalized = (value - minValue) / (maxValue - minValue);
    return laneHeight - LANE_PADDING_Y - normalized * usableHeight;
  };

  const toValue = (y: number): number => {
    const usableHeight = laneHeight - LANE_PADDING_Y * 2;
    const clampedY = Math.min(laneHeight - LANE_PADDING_Y, Math.max(LANE_PADDING_Y, y));
    const normalized = (laneHeight - LANE_PADDING_Y - clampedY) / usableHeight;
    const rawValue = minValue + normalized * (maxValue - minValue);
    return automationType === 'pitch-bend'
      ? clampMidiPitchBendValue(Math.round(rawValue))
      : clampMidiControllerValue(Math.round(rawValue));
  };

  const getPointLabel = (value: number): string => (
    automationType === 'pitch-bend' ? `${midiPitchBendToSignedValue(value)}` : `${value}`
  );

  const renderedPoints = points.map(point => {
    const preview = previewPoints[point.id];
    const absoluteBeat = preview?.absoluteBeat ?? point.absoluteBeat;
    const value = preview?.value ?? point.value;

    return {
      ...point,
      absoluteBeat,
      value,
      label: getPointLabel(value),
      x: absoluteBeat * beatWidth + keyWidth,
      y: toY(value),
      isSelected: selectedPointIdSet.has(point.id),
    };
  });
  const renderedPointsSorted = [...renderedPoints].sort((leftPoint, rightPoint) => {
    if (leftPoint.absoluteBeat !== rightPoint.absoluteBeat) {
      return leftPoint.absoluteBeat - rightPoint.absoluteBeat;
    }

    return leftPoint.id.localeCompare(rightPoint.id);
  });

  const polylinePoints = (() => {
    if (interpolationMode === 'step' || renderedPointsSorted.length === 0) {
      return '';
    }

    const linePoints = [...renderedPointsSorted];
    const lastPoint = linePoints[linePoints.length - 1];
    linePoints.push({
      ...lastPoint,
      id: `${lastPoint.id}-tail`,
      x: beatWidth * totalBeats + keyWidth,
    });

    return linePoints.map(point => `${point.x},${point.y}`).join(' ');
  })();

  const stepSegments = (() => {
    if (interpolationMode !== 'step' || renderedPointsSorted.length === 0) {
      return [];
    }

    return renderedPointsSorted.map((point, index) => ({
      id: `${point.id}-step`,
      x1: point.x,
      y1: point.y,
      x2: index < renderedPointsSorted.length - 1 ? renderedPointsSorted[index + 1].x : beatWidth * totalBeats + keyWidth,
    }));
  })();

  const commitSelection = async (nextSelectedIds: Set<string>) => {
    if (!activeRegion || !parentTrack) return;

    activeRegion.getNotes().forEach(note => note.deselect());
    activeRegion.getPitchBends().forEach(pitchBend => {
      if (nextSelectedIds.has(pitchBend.getId())) pitchBend.select();
      else pitchBend.deselect();
    });
    activeRegion.getControllerEventsByType().forEach(events => {
      events.forEach(controllerEvent => {
        if (nextSelectedIds.has(controllerEvent.getId())) controllerEvent.select();
        else controllerEvent.deselect();
      });
    });

    const selectedEvents: Array<KGMidiPitchBend | KGMidiControllerEvent> = [];
    activeRegion.getPitchBends().forEach(pitchBend => {
      if (nextSelectedIds.has(pitchBend.getId())) {
        selectedEvents.push(pitchBend);
      }
    });
    activeRegion.getControllerEventsByType().forEach(events => {
      events.forEach(controllerEvent => {
        if (nextSelectedIds.has(controllerEvent.getId())) {
          selectedEvents.push(controllerEvent);
        }
      });
    });

    const core = KGCore.instance();
    core.clearSelectedItems();
    if (selectedEvents.length > 0) {
      core.addSelectedItems(selectedEvents);
    }

    await updateTrack(parentTrack);
  };

  useEffect(() => {
    if (!activeRegion || !parentTrack) {
      return;
    }

    const visiblePointIds = new Set(points.map(point => point.id));
    const hiddenSelection = automationType === 'pitch-bend'
      ? selectedControllerEventIds.length > 0
      : selectedPitchBendIds.length > 0 || selectedControllerEventIds.some(id => !visiblePointIds.has(id));

    if (!hiddenSelection) {
      return;
    }

    activeRegion.getPitchBends().forEach(pitchBend => {
      if (!visiblePointIds.has(pitchBend.getId())) {
        pitchBend.deselect();
      }
    });
    activeRegion.getControllerEventsByType().forEach(events => {
      events.forEach(controllerEvent => {
        if (!visiblePointIds.has(controllerEvent.getId())) {
          controllerEvent.deselect();
        }
      });
    });

    const core = KGCore.instance();
    const visibleSelectedItems = core.getSelectedItems().filter(item => visiblePointIds.has(item.getId()));
    core.clearSelectedItems();
    if (visibleSelectedItems.length > 0) {
      core.addSelectedItems(visibleSelectedItems);
    }

    void updateTrack(parentTrack);
  }, [activeRegion, automationType, parentTrack, points, selectedControllerEventIds, selectedPitchBendIds, updateTrack]);

  const getLaneCoordinates = (clientX: number, clientY: number) => {
    if (!laneRef.current) {
      return null;
    }

    const rect = laneRef.current.getBoundingClientRect();
    return {
      x: clientX - rect.left + horizontalScrollLeft,
      y: clientY - rect.top,
    };
  };

  const buildPreviewFromDrag = (clientX: number, clientY: number): Record<string, PreviewPoint> => {
    const dragState = dragStateRef.current;
    const coordinates = getLaneCoordinates(clientX, clientY);
    if (!dragState || !coordinates) {
      return {};
    }

    const rawAbsoluteBeat = (coordinates.x - keyWidth) / beatWidth;
    const snappedAbsoluteBeat = KGPianoRollState.instance().getCurrentSnap() === 'NO SNAP'
      ? rawAbsoluteBeat
      : getSnappedBeatPosition(rawAbsoluteBeat, KGPianoRollState.instance().getCurrentSnap());
    const beatDelta = snappedAbsoluteBeat - dragState.originAbsoluteBeat;
    const rawDeltaValue = toValue(coordinates.y) - dragState.originValue;
    const valueDelta = Math.min(dragState.maxDeltaValue, Math.max(dragState.minDeltaValue, rawDeltaValue));

    const nextPreview: Record<string, PreviewPoint> = {};
    dragState.selectedPoints.forEach(point => {
      nextPreview[point.id] = {
        absoluteBeat: point.absoluteBeat + beatDelta,
        value: point.value + valueDelta,
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

    if (!dragState || !activeRegion || !parentTrack) {
      dragStateRef.current = null;
      applyPreviewPoints({});
      return;
    }

    const pendingPreview = Object.keys(previewPointsRef.current).length > 0 ? previewPointsRef.current : buildPreviewFromDrag(
      dragState.originClientX,
      dragState.originClientY,
    );

    if (dragState.hasMoved && Object.keys(pendingPreview).length > 0) {
      if (automationType === 'pitch-bend') {
        const snapshots = dragState.selectedPoints.map(point => ({
          pitchBendId: point.id,
          beat: point.relativeBeat,
          value: point.value,
        }));
        const updates = dragState.selectedPoints.map(point => {
          const preview = pendingPreview[point.id];
          return {
            pitchBendId: point.id,
            beat: preview.absoluteBeat - activeRegion.getStartFromBeat(),
            value: preview.value,
          };
        });
        KGCore.instance().executeCommand(new UpdatePitchBendPropertiesCommand(activeRegion.getId(), snapshots, updates));
      } else {
        const controller = getControllerNumberForAutomationType(automationType);
        if (controller !== null) {
          const snapshots = dragState.selectedPoints.map(point => ({
            controllerEventId: point.id,
            controller,
            beat: point.relativeBeat,
            value: point.value,
          }));
          const updates = dragState.selectedPoints.map(point => {
            const preview = pendingPreview[point.id];
            return {
              controllerEventId: point.id,
              controller,
              beat: preview.absoluteBeat - activeRegion.getStartFromBeat(),
              value: preview.value,
            };
          });
          KGCore.instance().executeCommand(new UpdateControllerEventPropertiesCommand(activeRegion.getId(), snapshots, updates));
        }
      }

      bumpAutomationRedrawVersion();
      await updateTrack(parentTrack);
      refreshProjectState();
      preventBackgroundClearRef.current = true;
    }

    dragStateRef.current = null;
    applyPreviewPoints({});
  };

  const handlePointMouseDown = async (pointId: string, event: React.MouseEvent<SVGCircleElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeRegion) {
      return;
    }

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

    const dragSelectedPoints = points.filter(candidate => nextSelection.has(candidate.id));
    const minDeltaValue = dragSelectedPoints.reduce((currentMin, candidate) => (
      Math.max(currentMin, minValue - candidate.value)
    ), Number.NEGATIVE_INFINITY);
    const maxDeltaValue = dragSelectedPoints.reduce((currentMax, candidate) => (
      Math.min(currentMax, maxValue - candidate.value)
    ), Number.POSITIVE_INFINITY);

    dragStateRef.current = {
      primaryPointId: pointId,
      originAbsoluteBeat: point.absoluteBeat,
      originValue: point.value,
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

    const nextSelection = lassoShiftKeyRef.current ? new Set(selectedPointIdSet) : new Set<string>();

    renderedPointsSorted.forEach(point => {
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

    if (KGPianoRollState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(event)) {
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
    if (!activeRegion || !parentTrack) {
      return;
    }

    const coordinates = getLaneCoordinates(clientX, clientY);
    if (!coordinates) {
      return;
    }

    const rawAbsoluteBeat = (coordinates.x - keyWidth) / beatWidth;
    const currentSnap = KGPianoRollState.instance().getCurrentSnap();
    const absoluteBeat = currentSnap === 'NO SNAP'
      ? rawAbsoluteBeat
      : getSnappedBeatPosition(rawAbsoluteBeat, currentSnap);
    const relativeBeat = absoluteBeat - activeRegion.getStartFromBeat();
    const value = toValue(coordinates.y);

    if (automationType === 'pitch-bend') {
      const command = new CreateMidiEventsCommand([], [{
        regionId: activeRegion.getId(),
        beat: relativeBeat,
        value,
      }]);
      KGCore.instance().executeCommand(command);
      const createdPitchBend = command.getCreatedPitchBends()[0]?.pitchBend;
      if (createdPitchBend) {
        await commitSelection(new Set([createdPitchBend.getId()]));
      }
    } else {
      const controller = getControllerNumberForAutomationType(automationType);
      if (controller === null) {
        return;
      }

      const command = new CreateMidiEventsCommand([], [], [{
        regionId: activeRegion.getId(),
        controller,
        beat: relativeBeat,
        value,
      }]);
      KGCore.instance().executeCommand(command);
      const createdControllerEvent = command.getCreatedControllerEvents()[0]?.controllerEvent;
      if (createdControllerEvent) {
        await commitSelection(new Set([createdControllerEvent.getId()]));
      }
    }

    bumpAutomationRedrawVersion();
    await updateTrack(parentTrack);
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

    if (KGPianoRollState.instance().getActiveTool() === 'pencil' || isModifierKeyPressed(event)) {
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
    if (isPointTarget(event.target)) {
      return;
    }

    await handleCreatePoint(event.clientX, event.clientY);
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
    target instanceof Element && target.closest('.piano-roll-automation-point') !== null
  );

  return (
    <div
      className="piano-roll-automation-lane"
      data-testid="piano-roll-automation-lane"
      aria-label={`${laneLabel} automation lane`}
      ref={laneRef}
    >
      <div className="piano-roll-automation-track" style={{ width: totalWidth }}>
        <div className="piano-roll-automation-gutter" />
        <div className="piano-roll-automation-lane-label">{laneLabel}</div>
        <div
          className={`piano-roll-automation-scroll-layer ${isModifierPressed ? 'pencil-cursor' : ''}`}
          style={{ transform: `translateX(-${horizontalScrollLeft}px)` }}
          onMouseDown={handleBackgroundMouseDown}
          onClick={(event) => { void handleBackgroundClick(event); }}
          onDoubleClick={(event) => { void handleBackgroundDoubleClick(event); }}
        >
          <div className="piano-roll-automation-grid" />
          <svg
            className="piano-roll-automation-svg"
            width="100%"
            height={laneHeight}
            viewBox={`0 0 ${beatWidth * totalBeats + keyWidth} ${laneHeight}`}
            preserveAspectRatio="none"
          >
            {interpolationMode === 'linear' && renderedPoints.length > 0 && (
              <polyline
                className="piano-roll-automation-line"
                fill="none"
                stroke={AUTOMATION_COLOR}
                strokeWidth="2"
                points={polylinePoints}
              />
            )}
            {interpolationMode === 'step' && stepSegments.map(segment => (
              <line
                key={segment.id}
                className="piano-roll-automation-line"
                x1={segment.x1}
                y1={segment.y1}
                x2={segment.x2}
                y2={segment.y1}
                stroke={AUTOMATION_COLOR}
                strokeWidth="2"
              />
            ))}
            {renderedPoints.map(point => {
              const labelY = Math.max(14, Math.min(laneHeight - 6, point.y - 10));

              return (
                <g key={point.id}>
                  <circle
                    className={`piano-roll-automation-point${point.isSelected ? ' selected' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={POINT_RADIUS}
                    fill={point.isSelected ? SELECTED_POINT_COLOR : AUTOMATION_COLOR}
                    stroke={point.isSelected ? SELECTED_POINT_COLOR : '#1d2428'}
                    strokeWidth={point.isSelected ? 3 : 2}
                    onMouseDown={(event) => { void handlePointMouseDown(point.id, event); }}
                  />
                  <text
                    className="piano-roll-automation-value"
                    x={point.x + 6}
                    y={labelY}
                    fill={point.isSelected ? SELECTED_POINT_COLOR : AUTOMATION_COLOR}
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {isLassoSelectingRef.current && (
            <div
              key={selectionBoxRenderTick}
              className="piano-roll-automation-selection-box"
              style={selectionBoxStyle}
            />
          )}
        </div>
        {renderedPointsSorted.length === 0 && (
          <div className="piano-roll-automation-empty-state">
            No {laneLabel} events in this region
          </div>
        )}
      </div>
    </div>
  );
};

export default PianoRollAutomationLane;
