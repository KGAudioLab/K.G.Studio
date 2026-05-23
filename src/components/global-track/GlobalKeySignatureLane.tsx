import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KeySignature } from '../../core/KGProject';
import { KGKeySignatureRegion } from '../../core/region/KGKeySignatureRegion';
import type { RegionClickOptions } from '../interfaces';
import { isModifierKeyPressed } from '../../util/osUtil';
import { TOOLBAR_CONSTANTS } from '../../constants';
import FloatingPopup from '../common/FloatingPopup';
import KeySignaturePickerPopup from '../KeySignaturePickerPopup';

interface GlobalKeySignatureLaneProps {
  signatureRegions: KGKeySignatureRegion[];
  maxBars: number;
  barWidthMultiplier: number;
  timeSignature: { numerator: number; denominator: number };
  selectedRegionIds: string[];
  pickerRegionId: string | null;
  onClosePicker: () => void;
  onSelectRegion: (regionId: string, options?: RegionClickOptions) => void;
  onCreateAtBar: (startBar: number) => void;
  onResizeRegion: (regionId: string, edge: 'start' | 'end', bar: number) => void;
  onChangeKeySignature: (regionId: string, keySignature: KeySignature) => void;
  onOpenPicker: (regionId: string) => void;
}

type ResizeEdge = 'start' | 'end' | null;

const REGION_EDGE_HITBOX_PX = 8;
const DRAG_THRESHOLD_PX = 4;

const GlobalKeySignatureLane: React.FC<GlobalKeySignatureLaneProps> = ({
  signatureRegions,
  maxBars,
  barWidthMultiplier,
  timeSignature,
  selectedRegionIds,
  pickerRegionId,
  onClosePicker,
  onSelectRegion,
  onCreateAtBar,
  onResizeRegion,
  onChangeKeySignature,
  onOpenPicker,
}) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const [previewBars, setPreviewBars] = useState<Record<string, { startBar: number; lengthBars: number }>>({});
  const [hoverEdges, setHoverEdges] = useState<Record<string, ResizeEdge>>({});
  const [isModifierPressed, setIsModifierPressed] = useState(false);
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
    () => signatureRegions.map(region => region.getId()),
    [signatureRegions]
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

    return regionIndex < signatureRegions.length - 1;
  };

  const getRenderedBarState = (region: KGKeySignatureRegion) => (
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
        onClosePicker();
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
  }, [onClosePicker]);

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

      const targetRegion = signatureRegions.find(region => region.getId() === interaction.regionId);
      if (!targetRegion) {
        return;
      }

      const targetIndex = getRegionIndex(interaction.regionId);
      const desiredBoundaryBar = getBarFromClientX(event.clientX);

      if (interaction.resizeEdge === 'start' && targetIndex > 0) {
        const previousRegion = signatureRegions[targetIndex - 1];
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

      if (interaction.resizeEdge === 'end' && targetIndex < signatureRegions.length - 1) {
        const nextRegion = signatureRegions[targetIndex + 1];
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
        onSelectRegion(interaction.regionId, { shiftKey: event.shiftKey });
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
  }, [getBarFromClientX, onResizeRegion, onSelectRegion, signatureRegions]);

  const handleLaneMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (!(event.target instanceof HTMLElement) || event.target.closest('.global-key-signature-region')) {
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
    if (!(event.target instanceof HTMLElement) || event.target.closest('.global-key-signature-region')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCreateAtBar(getCreateBarFromClientX(event.clientX));
  };

  return (
    <>
      <div
        ref={laneRef}
        className={`global-marker-lane global-key-signature-lane${pickerRegionId ? ' popup-open' : ''}${isModifierPressed ? ' pencil-cursor' : ''}`}
        onMouseDown={handleLaneMouseDown}
        onDoubleClick={handleLaneDoubleClick}
      >
        {signatureRegions.map(region => {
          const rendered = getRenderedBarState(region);
          const isSelected = selectedRegionIds.includes(region.getId());
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
              className={`global-marker-region global-key-signature-region${isSelected ? ' selected' : ''}`}
              style={{
                left: `${left}px`,
                width: `${width}px`,
                cursor: hoverEdges[region.getId()] ? 'col-resize' : 'pointer',
                zIndex: pickerRegionId === region.getId() ? 1006 : 1,
              }}
              onMouseEnter={() => setHoverEdges(prev => ({ ...prev, [region.getId()]: null }))}
              onMouseMove={(event) => {
                const nextEdge = getResizeEdgeFromMouseEvent(event);
                const normalizedEdge = nextEdge && canResizeEdge(region.getId(), nextEdge) ? nextEdge : null;
                setHoverEdges(prev => ({ ...prev, [region.getId()]: normalizedEdge }));
              }}
              onMouseLeave={() => setHoverEdges(prev => ({ ...prev, [region.getId()]: null }))}
              onMouseDown={(event) => {
                if (event.button !== 0) {
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
                onSelectRegion(region.getId(), { shiftKey: event.shiftKey });
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenPicker(region.getId());
              }}
            >
              <span className="global-marker-label">{region.getKeySignature()}</span>
              <FloatingPopup
                isOpen={pickerRegionId === region.getId()}
                onClose={onClosePicker}
                placement="bottom"
                className="key-signature-popup-anchor global-key-signature-popup-anchor"
                contentClassName="key-signature-popup-surface global-key-signature-popup-surface"
                panelClassName="key-signature-popup-panel global-key-signature-popup-panel"
                arrowClassName="key-signature-popup-arrow global-key-signature-popup-arrow"
                renderInPortal
                trigger={(
                  <span className="global-key-signature-trigger" aria-hidden="true" />
                )}
              >
                <KeySignaturePickerPopup
                  value={region.getKeySignature()}
                  onChange={(keySignature) => onChangeKeySignature(region.getId(), keySignature)}
                />
              </FloatingPopup>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default GlobalKeySignatureLane;
