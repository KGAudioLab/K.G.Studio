import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KGChordRegion } from '../../core/region/KGChordRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';
import { TOOLBAR_CONSTANTS } from '../../constants';
import FloatingPopup from '../common/FloatingPopup';
import ChordPickerPopup from '../ChordPickerPopup';

interface GlobalChordLaneProps {
  chordRegions: KGChordRegion[];
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  popupRegionId: string | null;
  onClosePopup: () => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtBeat: (startBeat: number) => void;
  onMoveRegion: (regionId: string, startBeat: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', beat: number) => void;
  onChangeChord: (regionId: string, symbol: string) => void;
  onOpenPopup: (regionId: string) => void;
  onTabNavigate: (regionId: string, direction: 'forward' | 'backward') => void;
}

type ResizeEdge = 'start' | 'end' | null;

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
  onCreateAtBeat,
  onMoveRegion,
  onResizeRegion,
  onChangeChord,
  onOpenPopup,
  onTabNavigate,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewBeats, setPreviewBeats] = useState<Record<string, { startBeat: number; length: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
  const suppressClickSelectionRef = useRef(false);
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
    const barWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;
    return barWidth / timeSignature.numerator;
  }, [barWidthMultiplier, timeSignature.numerator]);

  const clampStartBeat = (value: number) => Math.max(0, Math.min(totalBeats - 1, value));
  const clampEndBeat = (value: number) => Math.max(1, Math.min(totalBeats, value));
  const beatsPerBar = timeSignature.numerator;

  const getBeatFromClientX = (clientX: number, mode: 'start' | 'end' = 'start') => {
    if (!laneRef.current) {
      return 0;
    }

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

  const getRenderedBeatState = (region: KGChordRegion) => (
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
      if (!interactionRef.current) {
        return;
      }

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
      if (!interactionRef.current) {
        return;
      }

      const interaction = interactionRef.current;
      interactionRef.current = null;

      if (!interaction.moved) {
        setPreviewBeats({});
        suppressClickSelectionRef.current = true;
        onSelectRegion(interaction.regionId, getRegionClickOptions(event));
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
  }, [beatWidth, onMoveRegion, onResizeRegion, onSelectRegion, previewBeats]);

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
    onCreateAtBeat(getBarSnappedBeatFromClientX(event.clientX));
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
    onCreateAtBeat(getBarSnappedBeatFromClientX(event.clientX));
  };

  return (
    <div
      ref={laneRef}
      className={`global-marker-lane global-chord-lane${popupRegionId ? ' popup-open' : ''}${isModifierPressed ? ' pencil-cursor' : ''}`}
      onMouseDown={handleLaneMouseDown}
      onDoubleClick={handleLaneDoubleClick}
    >
      {chordRegions.map(region => {
        const { startBeat, length } = getRenderedBeatState(region);
        const isSelected = selectedRegionIds.includes(region.getId());
        const left = startBeat * beatWidth;
        const width = Math.max(beatWidth, length * beatWidth);

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
  );
};

export default GlobalChordLane;
