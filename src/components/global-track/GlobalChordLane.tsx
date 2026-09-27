import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaPlus } from 'react-icons/fa';
import { FaBan } from 'react-icons/fa6';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';
import { TOOLBAR_CONSTANTS } from '../../constants';
import FloatingPopup from '../common/FloatingPopup';
import ChordPickerPopup from '../ChordPickerPopup';
import { TrackType } from '../../core/track/KGTrack';

interface GlobalChordLaneProps {
  chordRegions: KGChordRegion[];
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  popupRegionId: string | null;
  onClosePopup: () => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtTick: (startTick: number) => void;
  onMoveRegion: (regionId: string, startTick: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', beat: number) => void;
  onChangeChord: (regionId: string, symbol: string) => void;
  onOpenPopup: (regionId: string) => void;
  onTabNavigate: (regionId: string, direction: 'forward' | 'backward') => void;
  onDropChordRegionsToTrack?: (draggedRegionId: string, trackIndex: number) => void;
}

type ResizeEdge = 'start' | 'end' | null;
type DragFeedbackMode = 'move' | 'import' | 'blocked';

const REGION_EDGE_HITBOX_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const getRegionClickOptions = (event: Pick<MouseEvent | React.MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>): RegionClickOptions => ({
  shiftKey: event.shiftKey,
  metaKey: event.metaKey,
  ctrlKey: event.ctrlKey,
});

const GlobalChordLane: React.FC<GlobalChordLaneProps> = ({
  chordRegions,
  maxBars,
  barWidthMultiplier,
  timeSignature,
  selectedRegionIds,
  popupRegionId,
  onClosePopup,
  onSelectRegion,
  onCreateAtTick,
  onMoveRegion,
  onResizeRegion,
  onChangeChord,
  onOpenPopup,
  onTabNavigate,
  onDropChordRegionsToTrack,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewTicks, setPreviewBeats] = useState<Record<string, { startTick: number; length: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const [dragFeedback, setDragFeedback] = useState<{ x: number; y: number; mode: DragFeedbackMode } | null>(null);
  const suppressClickSelectionRef = useRef(false);
  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | null;
    regionId: string;
    initialMouseX: number;
    initialMouseY: number;
    initialStartTick: number;
    initialLength: number;
    resizeEdge: ResizeEdge;
    moved: boolean;
  } | null>(null);

  const totalTicks = maxBars * timeSignature.numerator * 960 * (4 / timeSignature.denominator);
  const beatWidth = useMemo(() => {
    const barWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;
    return barWidth / timeSignature.numerator;
  }, [barWidthMultiplier, timeSignature.numerator]);

  const clampStartTick = (value: number) => Math.max(0, Math.min(totalTicks - 1, value));
  const clampEndTick = (value: number) => Math.max(1, Math.min(totalTicks, value));
  const ticksPerBar = timeSignature.numerator * 960 * (4 / timeSignature.denominator);
  const ticksPerMeterBeat = ticksPerBar / timeSignature.numerator;

  const getTickFromClientX = (clientX: number, mode: 'start' | 'end' = 'start') => {
    if (!laneRef.current) {
      return 0;
    }

    const rect = laneRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const rawTick = (relativeX / beatWidth) * ticksPerMeterBeat;
    return mode === 'end'
      ? clampEndTick(Math.round(rawTick))
      : clampStartTick(Math.round(rawTick));
  };

  const getBarSnappedTickFromClientX = (clientX: number) => {
    const beat = getTickFromClientX(clientX);
    return clampStartTick(Math.floor(beat / ticksPerBar) * ticksPerBar);
  };

  const getRenderedTickState = (region: KGChordRegion) => (
    previewTicks[region.getId()] ?? {
      startTick: region.getStartTick(),
      length: region.getLengthTicks(),
    }
  );

  const getResizeEdgeFromMouseEvent = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ): ResizeEdge => {
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;

    if (offsetX <= REGION_EDGE_HITBOX_PX) {
      return 'start';
    }

    if (rect.width - offsetX <= REGION_EDGE_HITBOX_PX) {
      return 'end';
    }

    return null;
  };

  const getTrackDropTarget = (clientX: number, clientY: number): { trackIndex: number; trackType: string | null } | null => {
    if (typeof document.elementFromPoint !== 'function') {
      return null;
    }

    const dropTarget = document.elementFromPoint(clientX, clientY)?.closest('.track-grid');
    if (!(dropTarget instanceof HTMLElement)) {
      return null;
    }

    const rawTrackIndex = dropTarget.dataset.trackIndex;
    if (!rawTrackIndex) {
      return null;
    }

    const trackIndex = Number(rawTrackIndex);
    if (!Number.isInteger(trackIndex)) {
      return null;
    }

    return {
      trackIndex,
      trackType: dropTarget.dataset.trackType ?? null,
    };
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isModifierKeyPressed(event)) {
        setIsModifierPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
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

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!interactionRef.current) {
        return;
      }

      const interaction = interactionRef.current;
      const deltaX = event.clientX - interaction.initialMouseX;
      const deltaY = event.clientY - interaction.initialMouseY;
      if (Math.abs(deltaX) >= DRAG_THRESHOLD_PX || Math.abs(deltaY) >= DRAG_THRESHOLD_PX) {
        interaction.moved = true;
      }

      if (interaction.mode === 'drag') {
        const tickDelta = Math.round(deltaX / beatWidth) * ticksPerMeterBeat;
        const nextStartTick = clampStartTick(interaction.initialStartTick + tickDelta);
        setPreviewBeats({
          [interaction.regionId]: {
            startTick: nextStartTick,
            length: interaction.initialLength,
          },
        });

        if (!interaction.moved) {
          setDragFeedback(null);
          document.body.style.cursor = '';
          return;
        }

        const dropTarget = getTrackDropTarget(event.clientX, event.clientY);
        if (dropTarget?.trackType === TrackType.MIDI) {
          setDragFeedback({ x: event.clientX, y: event.clientY, mode: 'import' });
          document.body.style.cursor = 'copy';
          return;
        }

        if (dropTarget) {
          setDragFeedback({ x: event.clientX, y: event.clientY, mode: 'blocked' });
          document.body.style.cursor = 'not-allowed';
          return;
        }

        setDragFeedback({ x: event.clientX, y: event.clientY, mode: 'move' });
        document.body.style.cursor = 'grabbing';
        return;
      }

      if (interaction.mode === 'resize') {
        const desiredTick = getTickFromClientX(
          event.clientX,
          interaction.resizeEdge === 'end' ? 'end' : 'start'
        );

        if (interaction.resizeEdge === 'start') {
          const nextStartTick = Math.min(desiredTick, interaction.initialStartTick + interaction.initialLength - 1);
          const endTick = interaction.initialStartTick + interaction.initialLength;
          setPreviewBeats({
            [interaction.regionId]: {
              startTick: nextStartTick,
              length: Math.max(1, endTick - nextStartTick),
            },
          });
          return;
        }

        setPreviewBeats({
          [interaction.regionId]: {
            startTick: interaction.initialStartTick,
            length: Math.max(1, desiredTick - interaction.initialStartTick),
          },
        });
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!interactionRef.current) {
        return;
      }

      const interaction = interactionRef.current;
      interactionRef.current = null;
      setDragFeedback(null);
      document.body.style.cursor = '';

      if (!interaction.moved) {
        setPreviewBeats({});
        suppressClickSelectionRef.current = true;
        onSelectRegion(interaction.regionId, getRegionClickOptions(event));
        return;
      }

      const preview = previewTicks[interaction.regionId];
      setPreviewBeats({});

      if (!preview) {
        return;
      }

      if (interaction.mode === 'drag') {
        const dropTarget = getTrackDropTarget(event.clientX, event.clientY);
        if (dropTarget !== null) {
          onDropChordRegionsToTrack?.(interaction.regionId, dropTarget.trackIndex);
          return;
        }

        onMoveRegion(interaction.regionId, preview.startTick);
        return;
      }

      if (interaction.mode === 'resize' && interaction.resizeEdge) {
        const beat = interaction.resizeEdge === 'start'
          ? preview.startTick
          : preview.startTick + preview.length;
        onResizeRegion(interaction.regionId, interaction.resizeEdge, beat);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      setDragFeedback(null);
      document.body.style.cursor = '';
    };
  }, [beatWidth, onDropChordRegionsToTrack, onMoveRegion, onResizeRegion, onSelectRegion, previewTicks]);

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (event.target.closest('.global-chord-region')) {
      return;
    }
    if (!isModifierKeyPressed(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCreateAtTick(getBarSnappedTickFromClientX(event.clientX));
  };

  const handleLaneDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (event.target.closest('.global-chord-region')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCreateAtTick(getBarSnappedTickFromClientX(event.clientX));
  };

  return (
    <>
      <div
        ref={laneRef}
        className={`global-marker-lane global-chord-lane${popupRegionId ? ' popup-open' : ''}${isModifierPressed ? ' pencil-cursor' : ''}`}
        onMouseDown={handleLaneMouseDown}
        onDoubleClick={handleLaneDoubleClick}
      >
        {chordRegions.map(region => {
        const { startTick, length } = getRenderedTickState(region);
        const isSelected = selectedRegionIds.includes(region.getId());
        const left = (startTick / ticksPerMeterBeat) * beatWidth;
        const width = Math.max(1, (length / ticksPerMeterBeat) * beatWidth);

        return (
          <div
            key={region.getId()}
            className={`global-marker-region global-chord-region${isSelected ? ' selected' : ''}`}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              cursor: hoverEdges[region.getId()] ? 'ew-resize' : undefined,
              zIndex: popupRegionId === region.getId() ? 1006 : 1,
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectRegion(region.getId(), { shiftKey: false, metaKey: false, ctrlKey: false });
              onOpenPopup(region.getId());
            }}
            onMouseMove={(event) => {
              if (interactionRef.current?.regionId === region.getId()) {
                return;
              }

              const resizeEdge = getResizeEdgeFromMouseEvent(event);
              setHoverEdges((current) => (
                current[region.getId()] === resizeEdge
                  ? current
                  : {
                      ...current,
                      [region.getId()]: resizeEdge,
                    }
              ));
            }}
            onMouseLeave={() => {
              setHoverEdges((current) => {
                if (!current[region.getId()]) {
                  return current;
                }

                return {
                  ...current,
                  [region.getId()]: null,
                };
              });
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              if ((event.target as HTMLElement).closest('.global-chord-drag-handle')) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();

              const resizeEdge = getResizeEdgeFromMouseEvent(event);
              interactionRef.current = {
                mode: resizeEdge ? 'resize' : 'drag',
                regionId: region.getId(),
                initialMouseX: event.clientX,
                initialMouseY: event.clientY,
                initialStartTick: region.getStartTick(),
                initialLength: region.getLengthTicks(),
                resizeEdge,
                moved: false,
              };
            }}
            onClick={(event) => {
              event.stopPropagation();
              if (suppressClickSelectionRef.current) {
                suppressClickSelectionRef.current = false;
                return;
              }
              onSelectRegion(region.getId(), getRegionClickOptions(event));
            }}
          >
            <span className="global-marker-label">{region.getSymbol()}</span>
            <FloatingPopup
              isOpen={popupRegionId === region.getId()}
              onClose={onClosePopup}
              placement="bottom"
              className="global-chord-popup-anchor"
              contentClassName="global-chord-popup-surface"
              panelClassName="global-chord-popup-panel"
              arrowClassName="global-chord-popup-arrow"
              renderInPortal
              trigger={<span className="global-chord-trigger" aria-hidden="true" />}
            >
              <ChordPickerPopup
                value={region.getSymbol()}
                onChange={(symbol) => onChangeChord(region.getId(), symbol)}
                onTabNavigate={(direction) => onTabNavigate(region.getId(), direction)}
              />
            </FloatingPopup>
          </div>
        );
        })}
      </div>
      {dragFeedback && createPortal(
        <div
          className={`global-chord-drag-feedback global-chord-drag-feedback-${dragFeedback.mode}`}
          style={{ left: `${dragFeedback.x + 14}px`, top: `${dragFeedback.y + 14}px` }}
        >
          <span className="global-chord-drag-feedback-icon">
            {dragFeedback.mode === 'blocked' ? <FaBan /> : <FaPlus />}
          </span>
          <span className="global-chord-drag-feedback-label">
            {dragFeedback.mode === 'import'
              ? 'Convert to MIDI'
              : dragFeedback.mode === 'blocked'
                ? 'Audio tracks not supported'
                : 'Move chord'}
          </span>
        </div>,
        document.body
      )}
    </>
  );
};

export default GlobalChordLane;
