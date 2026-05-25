import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGTempoRegion } from '../../core/region/KGTempoRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';
import { TIME_CONSTANTS, TOOLBAR_CONSTANTS } from '../../constants';

interface GlobalTempoLaneProps {
  tempoRegions: KGTempoRegion[];
  maxBars: number;
  barWidthMultiplier: number;
  selectedRegionIds: string[];
  editingRegionId: string | null;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onCommitEdit: (regionId: string) => void;
  onCancelEdit: () => void;
  onBeginEdit: (regionId: string) => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtBar: (startBar: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', bar: number) => void;
}

type ResizeEdge = 'start' | 'end' | null;

const REGION_EDGE_HITBOX_PX = 8;
const DRAG_THRESHOLD_PX = 4;
const getRegionClickOptions = (event: Pick<MouseEvent | React.MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>): RegionClickOptions => ({
  shiftKey: event.shiftKey,
  metaKey: event.metaKey,
  ctrlKey: event.ctrlKey,
});

const GlobalTempoLane: React.FC<GlobalTempoLaneProps> = ({
  tempoRegions,
  maxBars,
  barWidthMultiplier,
  selectedRegionIds,
  editingRegionId,
  editingText,
  onEditingTextChange,
  onCommitEdit,
  onCancelEdit,
  onBeginEdit,
  onSelectRegion,
  onCreateAtBar,
  onResizeRegion,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewBars, setPreviewBars] = useState<Record<string, { startBar: number; lengthBars: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const suppressClickSelectionRef = useRef(false);
  const interactionRef = useRef<{
    mode: 'resize' | null;
    regionId: string;
    resizeEdge: ResizeEdge;
    initialMouseX: number;
    moved: boolean;
  } | null>(null);

  const barWidth = useMemo(
    () => TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier,
    [barWidthMultiplier]
  );

  const regionOrder = useMemo(
    () => tempoRegions.map(region => region.getId()),
    [tempoRegions]
  );

  const getRegionIndex = (regionId: string) => regionOrder.findIndex(candidateId => candidateId === regionId);
  const canResizeEdge = (regionId: string, edge: 'start' | 'end') => {
    const regionIndex = getRegionIndex(regionId);
    if (regionIndex === -1) {
      return false;
    }

    if (edge === 'start') {
      return regionIndex > 0;
    }

    return regionIndex < tempoRegions.length - 1;
  };

  const getRenderedBarState = (region: KGTempoRegion) => (
    previewBars[region.getId()] ?? {
      startBar: region.getStartBar(),
      lengthBars: region.getLengthBars(),
    }
  );

  const getResizeEdgeFromMouseEvent = (event: React.MouseEvent<HTMLDivElement, MouseEvent>): ResizeEdge => {
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

  const getBarFromClientX = (clientX: number) => {
    if (!laneRef.current) {
      return 0;
    }

    const rect = laneRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    return Math.max(0, Math.min(maxBars, Math.round(relativeX / barWidth)));
  };

  const getCreateBarFromClientX = (clientX: number) => {
    if (!laneRef.current) {
      return 0;
    }

    const rect = laneRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    return Math.max(0, Math.min(maxBars - 1, Math.floor(relativeX / barWidth)));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isModifierKeyPressed(event)) {
        setIsModifierPressed(true);
      }

      if (event.key === 'Escape') {
        onCancelEdit();
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
  }, [onCancelEdit]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!interactionRef.current) {
        return;
      }

      const interaction = interactionRef.current;
      const deltaX = event.clientX - interaction.initialMouseX;
      if (Math.abs(deltaX) >= DRAG_THRESHOLD_PX) {
        interaction.moved = true;
      }

      if (interaction.mode !== 'resize' || !interaction.resizeEdge) {
        return;
      }

      const targetRegion = tempoRegions.find(region => region.getId() === interaction.regionId);
      if (!targetRegion) {
        return;
      }

      const targetIndex = getRegionIndex(interaction.regionId);
      const desiredBoundaryBar = getBarFromClientX(event.clientX);

      if (interaction.resizeEdge === 'start' && targetIndex > 0) {
        const previousRegion = tempoRegions[targetIndex - 1];
        const targetEndBar = targetRegion.getEndBar();
        const clampedBoundaryBar = Math.max(
          previousRegion.getStartBar() + 1,
          Math.min(desiredBoundaryBar, targetEndBar - 1)
        );

        setPreviewBars({
          [previousRegion.getId()]: {
            startBar: previousRegion.getStartBar(),
            lengthBars: clampedBoundaryBar - previousRegion.getStartBar(),
          },
          [targetRegion.getId()]: {
            startBar: clampedBoundaryBar,
            lengthBars: targetEndBar - clampedBoundaryBar,
          },
        });
        return;
      }

      if (interaction.resizeEdge === 'end' && targetIndex < tempoRegions.length - 1) {
        const nextRegion = tempoRegions[targetIndex + 1];
        const nextEndBar = nextRegion.getEndBar();
        const clampedBoundaryBar = Math.max(
          targetRegion.getStartBar() + 1,
          Math.min(desiredBoundaryBar, nextEndBar - 1)
        );

        setPreviewBars({
          [targetRegion.getId()]: {
            startBar: targetRegion.getStartBar(),
            lengthBars: clampedBoundaryBar - targetRegion.getStartBar(),
          },
          [nextRegion.getId()]: {
            startBar: clampedBoundaryBar,
            lengthBars: nextEndBar - clampedBoundaryBar,
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
      const resizeEdge = interaction.resizeEdge;
      const shouldResize = interaction.moved && resizeEdge !== null;
      setPreviewBars({});

      if (!shouldResize) {
        suppressClickSelectionRef.current = true;
        onSelectRegion(interaction.regionId, getRegionClickOptions(event));
        return;
      }

      onResizeRegion(interaction.regionId, resizeEdge, getBarFromClientX(event.clientX));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getBarFromClientX, onResizeRegion, onSelectRegion, tempoRegions]);

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (!(event.target instanceof HTMLElement) || event.target.closest('.global-tempo-region')) {
      return;
    }

    if (!isModifierKeyPressed(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCreateAtBar(getCreateBarFromClientX(event.clientX));
  };

  const handleLaneDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.closest('.global-tempo-region')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCreateAtBar(getCreateBarFromClientX(event.clientX));
  };

  return (
    <div
      ref={laneRef}
      className={`global-marker-lane global-tempo-lane${isModifierPressed ? ' pencil-cursor' : ''}`}
      onMouseDown={handleLaneMouseDown}
      onDoubleClick={handleLaneDoubleClick}
    >
      {tempoRegions.map(region => {
        const rendered = getRenderedBarState(region);
        const isSelected = selectedRegionIds.includes(region.getId());
        const isEditing = editingRegionId === region.getId();
        const left = rendered.startBar * barWidth;
        const clampedEndBar = Math.max(rendered.startBar, Math.min(rendered.startBar + rendered.lengthBars, maxBars));
        const widthBars = Math.max(0, clampedEndBar - rendered.startBar);
        const width = Math.max(barWidth, widthBars * barWidth);

        if (rendered.startBar >= maxBars || widthBars <= 0) {
          return null;
        }

        return (
          <div
            key={region.getId()}
            className={`global-marker-region global-tempo-region${isSelected ? ' selected' : ''}`}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              cursor: isEditing ? 'text' : hoverEdges[region.getId()] ? 'col-resize' : 'pointer',
            }}
            onMouseEnter={() => setHoverEdges(prev => ({ ...prev, [region.getId()]: null }))}
            onMouseMove={(event) => {
              if (isEditing) {
                return;
              }

              const nextEdge = getResizeEdgeFromMouseEvent(event);
              const normalizedEdge = nextEdge && canResizeEdge(region.getId(), nextEdge) ? nextEdge : null;
              setHoverEdges(prev => ({ ...prev, [region.getId()]: normalizedEdge }));
            }}
            onMouseLeave={() => setHoverEdges(prev => ({ ...prev, [region.getId()]: null }))}
            onMouseDown={(event) => {
              if (event.button !== 0 || isEditing) {
                return;
              }

              const nextEdge = getResizeEdgeFromMouseEvent(event);
              const normalizedEdge = nextEdge && canResizeEdge(region.getId(), nextEdge) ? nextEdge : null;
              if (!normalizedEdge) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              interactionRef.current = {
                mode: 'resize',
                regionId: region.getId(),
                resizeEdge: normalizedEdge,
                initialMouseX: event.clientX,
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
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelectRegion(region.getId(), { shiftKey: false, metaKey: false, ctrlKey: false });
              onBeginEdit(region.getId());
            }}
          >
            {isEditing ? (
              <input
                className="global-marker-input"
                value={editingText}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(event) => {
                  const digitsOnly = event.target.value.replace(/\D+/g, '');
                  onEditingTextChange(digitsOnly);
                }}
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
              <span className="global-marker-label">{region.getDisplayName()}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default GlobalTempoLane;
