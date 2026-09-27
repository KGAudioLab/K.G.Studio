import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';
import { TOOLBAR_CONSTANTS } from '../../constants';

interface GlobalMarkerLaneProps {
  markerRegions: KGMarkerRegion[];
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  editingRegionId: string | null;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onCommitEdit: (regionId: string) => void;
  onCancelEdit: () => void;
  onBeginEdit: (regionId: string) => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtTick: (startTick: number) => void;
  onMoveRegion: (regionId: string, startTick: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', beat: number) => void;
}

type ResizeEdge = 'start' | 'end' | null;

const REGION_EDGE_HITBOX_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const getRegionClickOptions = (event: Pick<MouseEvent | React.MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>): RegionClickOptions => ({
  shiftKey: event.shiftKey,
  metaKey: event.metaKey,
  ctrlKey: event.ctrlKey,
});

const GlobalMarkerLane: React.FC<GlobalMarkerLaneProps> = ({
  markerRegions,
  maxBars,
  barWidthMultiplier,
  timeSignature,
  selectedRegionIds,
  editingRegionId,
  editingText,
  onEditingTextChange,
  onCommitEdit,
  onCancelEdit,
  onBeginEdit,
  onSelectRegion,
  onCreateAtTick,
  onMoveRegion,
  onResizeRegion,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewTicks, setPreviewBeats] = useState<Record<string, { startTick: number; length: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | null;
    regionId: string;
    initialMouseX: number;
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
    if (!laneRef.current) return 0;
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

  const getRenderedTickState = (region: KGMarkerRegion) => (
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
      if (!interactionRef.current) return;

      const interaction = interactionRef.current;
      const deltaX = event.clientX - interaction.initialMouseX;
      if (Math.abs(deltaX) >= DRAG_THRESHOLD_PX) {
        interaction.moved = true;
      }

      if (interaction.mode === 'drag') {
        const tickDelta = Math.round((deltaX / beatWidth) * ticksPerMeterBeat);
        const nextStartTick = clampStartTick(interaction.initialStartTick + tickDelta);
        setPreviewBeats({
          [interaction.regionId]: {
            startTick: nextStartTick,
            length: interaction.initialLength,
          },
        });
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
      if (!interactionRef.current) return;

      const interaction = interactionRef.current;
      interactionRef.current = null;

      if (!interaction.moved) {
        setPreviewBeats({});
        onSelectRegion(interaction.regionId, getRegionClickOptions(event));
        return;
      }

      const preview = previewTicks[interaction.regionId];
      setPreviewBeats({});

      if (!preview) {
        return;
      }

      if (interaction.mode === 'drag') {
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
    };
  }, [beatWidth, onMoveRegion, onResizeRegion, onSelectRegion, previewTicks, totalTicks]);

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.global-marker-region')) return;
    if (!isModifierKeyPressed(event)) return;

    event.preventDefault();
    event.stopPropagation();
    onCreateAtTick(getBarSnappedTickFromClientX(event.clientX));
  };

  const handleLaneDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.global-marker-region')) return;

    event.preventDefault();
    event.stopPropagation();
    onCreateAtTick(getBarSnappedTickFromClientX(event.clientX));
  };

  return (
    <div
      ref={laneRef}
      className={`global-marker-lane${isModifierPressed ? ' pencil-cursor' : ''}`}
      onMouseDown={handleLaneMouseDown}
      onDoubleClick={handleLaneDoubleClick}
    >
      {markerRegions.map(region => {
        const { startTick, length } = getRenderedTickState(region);
        const isSelected = selectedRegionIds.includes(region.getId());
        const isEditing = editingRegionId === region.getId();
        const left = (startTick / ticksPerMeterBeat) * beatWidth;
        const width = Math.max(1, (length / ticksPerMeterBeat) * beatWidth);

        return (
          <div
            key={region.getId()}
            className={`global-marker-region${isSelected ? ' selected' : ''}`}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              cursor: isEditing ? 'text' : hoverEdges[region.getId()] ? 'ew-resize' : undefined,
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onSelectRegion(region.getId(), { shiftKey: false, metaKey: false, ctrlKey: false });
              onBeginEdit(region.getId());
            }}
            onMouseMove={(event) => {
              if (isEditing) {
                return;
              }

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
              if (event.button !== 0) return;
              if (isEditing) return;
              event.preventDefault();
              event.stopPropagation();

              const resizeEdge = getResizeEdgeFromMouseEvent(event);

              interactionRef.current = {
                mode: resizeEdge ? 'resize' : 'drag',
                regionId: region.getId(),
                initialMouseX: event.clientX,
                initialStartTick: region.getStartTick(),
                initialLength: region.getLengthTicks(),
                resizeEdge,
                moved: false,
              };
            }}
          >
            {isEditing ? (
              <input
                className="global-marker-input"
                value={editingText}
                onChange={(event) => onEditingTextChange(event.target.value.replace(/\r?\n/g, ' '))}
                onBlur={() => onCommitEdit(region.getId())}
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommitEdit(region.getId());
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancelEdit();
                  }
                }}
                autoFocus
              />
            ) : (
              <span className="global-marker-label">{region.getName()}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GlobalMarkerLane;
