import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';

interface GlobalMarkerLaneProps {
  markerRegions: KGMarkerRegion[];
  maxBars: number;
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  editingRegionId: string | null;
  editingText: string;
  onEditingTextChange: (value: string) => void;
  onCommitEdit: (regionId: string) => void;
  onCancelEdit: () => void;
  onBeginEdit: (regionId: string) => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtBeat: (startBeat: number) => void;
  onMoveRegion: (regionId: string, startBeat: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', beat: number) => void;
}

type ResizeEdge = 'start' | 'end' | null;

const REGION_EDGE_HITBOX_PX = 8;
const DRAG_THRESHOLD_PX = 4;

const GlobalMarkerLane: React.FC<GlobalMarkerLaneProps> = ({
  markerRegions,
  maxBars,
  timeSignature,
  selectedRegionIds,
  editingRegionId,
  editingText,
  onEditingTextChange,
  onCommitEdit,
  onCancelEdit,
  onBeginEdit,
  onSelectRegion,
  onCreateAtBeat,
  onMoveRegion,
  onResizeRegion,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewBeats, setPreviewBeats] = useState<Record<string, { startBeat: number; length: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const interactionRef = useRef<{
    mode: 'drag' | 'resize' | null;
    regionId: string;
    initialMouseX: number;
    initialStartBeat: number;
    initialLength: number;
    resizeEdge: ResizeEdge;
    moved: boolean;
  } | null>(null);

  const totalBeats = maxBars * timeSignature.numerator;
  const beatWidth = useMemo(() => {
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width')
    ) || 40;
    return barWidth / timeSignature.numerator;
  }, [timeSignature.numerator]);

  const clampStartBeat = (value: number) => Math.max(0, Math.min(totalBeats - 1, value));
  const clampEndBeat = (value: number) => Math.max(1, Math.min(totalBeats, value));
  const beatsPerBar = timeSignature.numerator;

  const getBeatFromClientX = (clientX: number, mode: 'start' | 'end' = 'start') => {
    if (!laneRef.current) return 0;
    const rect = laneRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const rawBeat = relativeX / beatWidth;
    return mode === 'end'
      ? clampEndBeat(Math.round(rawBeat))
      : clampStartBeat(Math.round(rawBeat));
  };

  const getBarSnappedBeatFromClientX = (clientX: number) => {
    const beat = getBeatFromClientX(clientX);
    return clampStartBeat(Math.floor(beat / beatsPerBar) * beatsPerBar);
  };

  const getRenderedBeatState = (region: KGMarkerRegion) => (
    previewBeats[region.getId()] ?? {
      startBeat: region.getStartFromBeat(),
      length: region.getLength(),
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
        const beatDelta = Math.round(deltaX / beatWidth);
        const nextStartBeat = clampStartBeat(interaction.initialStartBeat + beatDelta);
        setPreviewBeats({
          [interaction.regionId]: {
            startBeat: nextStartBeat,
            length: interaction.initialLength,
          },
        });
        return;
      }

      if (interaction.mode === 'resize') {
        const desiredBeat = getBeatFromClientX(
          event.clientX,
          interaction.resizeEdge === 'end' ? 'end' : 'start'
        );

        if (interaction.resizeEdge === 'start') {
          const nextStartBeat = Math.min(desiredBeat, interaction.initialStartBeat + interaction.initialLength - 1);
          const endBeat = interaction.initialStartBeat + interaction.initialLength;
          setPreviewBeats({
            [interaction.regionId]: {
              startBeat: nextStartBeat,
              length: Math.max(1, endBeat - nextStartBeat),
            },
          });
          return;
        }

        setPreviewBeats({
          [interaction.regionId]: {
            startBeat: interaction.initialStartBeat,
            length: Math.max(1, desiredBeat - interaction.initialStartBeat),
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
        onSelectRegion(interaction.regionId, { shiftKey: event.shiftKey });
        return;
      }

      const preview = previewBeats[interaction.regionId];
      setPreviewBeats({});

      if (!preview) {
        return;
      }

      if (interaction.mode === 'drag') {
        onMoveRegion(interaction.regionId, preview.startBeat);
        return;
      }

      if (interaction.mode === 'resize' && interaction.resizeEdge) {
        const beat = interaction.resizeEdge === 'start'
          ? preview.startBeat
          : preview.startBeat + preview.length;
        onResizeRegion(interaction.regionId, interaction.resizeEdge, beat);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [beatWidth, onMoveRegion, onResizeRegion, onSelectRegion, previewBeats, totalBeats]);

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.global-marker-region')) return;
    if (!isModifierKeyPressed(event)) return;

    event.preventDefault();
    event.stopPropagation();
    onCreateAtBeat(getBarSnappedBeatFromClientX(event.clientX));
  };

  const handleLaneDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('.global-marker-region')) return;

    event.preventDefault();
    event.stopPropagation();
    onCreateAtBeat(getBarSnappedBeatFromClientX(event.clientX));
  };

  return (
    <div
      ref={laneRef}
      className={`global-marker-lane${isModifierPressed ? ' pencil-cursor' : ''}`}
      onMouseDown={handleLaneMouseDown}
      onDoubleClick={handleLaneDoubleClick}
    >
      {markerRegions.map(region => {
        const { startBeat, length } = getRenderedBeatState(region);
        const isSelected = selectedRegionIds.includes(region.getId());
        const isEditing = editingRegionId === region.getId();
        const left = startBeat * beatWidth;
        const width = Math.max(beatWidth, length * beatWidth);

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
              onSelectRegion(region.getId(), { shiftKey: false });
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
                initialStartBeat: region.getStartFromBeat(),
                initialLength: region.getLength(),
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
