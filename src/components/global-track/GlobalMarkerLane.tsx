import React, { useEffect, useRef, useState } from 'react';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { clampTimelineTick, ticksPerBar, toTimelineTick } from '../../core/timing';
import type { RegionClickOptions } from '../interfaces';
import { snapBarValue } from '../../util/mainContentSnapUtil';
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
  onResizeRegion: (regionId: string, edge: 'start' | 'end', tick: number) => void;
}

type ResizeEdge = 'start' | 'end' | null;

interface MarkerInteraction {
  regionId: string;
  initialMouseX: number;
  initialStartTick: number;
  initialLength: number;
  resizeEdge: ResizeEdge;
  moved: boolean;
}

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
  const [previewTicks, setPreviewTicks] = useState<Record<string, { startTick: number; length: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const interactionRef = useRef<MarkerInteraction | null>(null);

  const barWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;
  const barTicks = ticksPerBar(timeSignature);
  const totalTicks = maxBars * barTicks;
  const beatsPerBar = timeSignature.numerator;

  const getBarSnappedTickFromClientX = (clientX: number) => {
    if (!laneRef.current) return 0;
    const relativeX = clientX - laneRef.current.getBoundingClientRect().left;
    const tick = clampTimelineTick((relativeX / barWidth) * barTicks, 0, totalTicks - 1);
    return Math.floor(tick / barTicks) * barTicks;
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
    const getPreview = (interaction: MarkerInteraction, clientX: number) => {
      const { initialStartTick, initialLength, resizeEdge } = interaction;
      const tickDelta = ((clientX - interaction.initialMouseX) / barWidth) * barTicks;
      const mainContentState = KGMainContentState.instance();
      const snapSettings = {
        enabled: mainContentState.isSnappingEnabled(),
        mode: mainContentState.getSnappingMode(),
        ticksPerBar: beatsPerBar,
      };
      const snapTickValue = (tick: number) => toTimelineTick(snapBarValue(tick / barTicks, snapSettings) * barTicks);

      if (resizeEdge === 'end') {
        const rawLength = initialLength + tickDelta;
        let snappedLength: number;
        if (snapSettings.enabled && snapSettings.mode === 'bar') {
          const firstAllowedEndTick = Math.ceil((initialStartTick + 1) / barTicks) * barTicks;
          const snappedEndTick = snapTickValue(initialStartTick + rawLength);
          snappedLength = Math.max(firstAllowedEndTick, snappedEndTick) - initialStartTick;
        } else {
          snappedLength = snapTickValue(rawLength);
        }
        const length = Math.max(1, Math.min(totalTicks - initialStartTick, snappedLength));
        return { startTick: initialStartTick, length };
      }

      const startTick = Math.max(0, Math.min(totalTicks - 1, snapTickValue(initialStartTick + tickDelta)));
      if (resizeEdge === 'start') {
        const endTick = initialStartTick + initialLength;
        const resizedStartTick = Math.min(startTick, endTick - 1);
        return { startTick: resizedStartTick, length: endTick - resizedStartTick };
      }

      return { startTick, length: initialLength };
    };

    const handleMouseMove = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      if (!interaction.moved && Math.abs(event.clientX - interaction.initialMouseX) < DRAG_THRESHOLD_PX) return;

      interaction.moved = true;
      setPreviewTicks({ [interaction.regionId]: getPreview(interaction, event.clientX) });
    };

    const handleMouseUp = (event: MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;
      setPreviewTicks({});

      if (!interaction.moved) {
        onSelectRegion(interaction.regionId, getRegionClickOptions(event));
        return;
      }

      const { startTick, length } = getPreview(interaction, event.clientX);
      if (startTick === interaction.initialStartTick && length === interaction.initialLength) {
        return;
      }

      if (interaction.resizeEdge) {
        const tick = interaction.resizeEdge === 'start' ? startTick : startTick + length;
        onResizeRegion(interaction.regionId, interaction.resizeEdge, tick);
      } else {
        onMoveRegion(interaction.regionId, startTick);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [barTicks, barWidth, beatsPerBar, onMoveRegion, onResizeRegion, onSelectRegion, totalTicks]);

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
        const left = (startTick / barTicks) * barWidth;
        const width = Math.max(1, (length / barTicks) * barWidth);

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
