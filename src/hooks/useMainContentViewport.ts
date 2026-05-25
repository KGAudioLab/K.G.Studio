import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { KGGlobalRegion } from '../core/region/KGGlobalRegion';
import { KGKeySignatureRegion } from '../core/region/KGKeySignatureRegion';
import { KGTempoRegion } from '../core/region/KGTempoRegion';
import { KGMainContentState } from '../core/state/KGMainContentState';
import { BAR_NUMBERS_CONSTANTS, DEBUG_MODE, TOOLBAR_CONSTANTS } from '../constants';
import { ChangeLoopSettingsCommand } from '../core/commands';
import { KGCore } from '../core/KGCore';
import { useProjectStore } from '../stores/projectStore';

interface UseMainContentViewportParams {
  barWidthMultiplier: number;
  timeSignature: { numerator: number; denominator: number };
  isPlaying: boolean;
  autoScrollEnabled: boolean;
  playheadPosition: number;
  mainContentScrollRequest: number | null;
  maxBars: number;
  isLooping: boolean;
  loopingRange: [number, number];
  setPlayheadPosition: (beatPosition: number) => void;
  requestPianoRollScroll: (beatPosition: number) => void;
  editingRegionIds: string[];
  findProjectRegionById: (regionId: string) => KGGlobalRegion | import('../core/region/KGRegion').KGRegion | null;
}

export interface UseMainContentViewportResult {
  mainContentRef: React.RefObject<HTMLDivElement | null>;
  barNumbersRef: React.RefObject<HTMLDivElement | null>;
  handleBarNumbersMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  isBarInLoopRange: (barIndex: number) => boolean;
}

export function useMainContentViewport({
  barWidthMultiplier,
  timeSignature,
  isPlaying,
  autoScrollEnabled,
  playheadPosition,
  mainContentScrollRequest,
  maxBars,
  isLooping,
  loopingRange,
  setPlayheadPosition,
  requestPianoRollScroll,
  editingRegionIds,
  findProjectRegionById,
}: UseMainContentViewportParams): UseMainContentViewportResult {
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const expectedScrollLeftRef = useRef<number>(-1);
  const isPlayingRef = useRef(false);
  const previousBarWidthMultiplierRef = useRef(barWidthMultiplier);
  const barNumbersRef = useRef<HTMLDivElement | null>(null);
  const isLoopDraggingRef = useRef(false);
  const loopDragStartBarRef = useRef<number | null>(null);
  const loopDragStartXRef = useRef<number | null>(null);
  const loopDragOriginalSettingsRef = useRef<{ isLooping: boolean; loopingRange: [number, number] } | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useLayoutEffect(() => {
    const previousMultiplier = previousBarWidthMultiplierRef.current;
    if (previousMultiplier === barWidthMultiplier) {
      return;
    }

    previousBarWidthMultiplierRef.current = barWidthMultiplier;

    const container = mainContentRef.current;
    if (!container) {
      return;
    }

    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width'),
      10
    ) || 200;
    const visibleMusicWidth = Math.max(0, container.clientWidth - infoWidth);
    const previousBarWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * previousMultiplier;
    const nextBarWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;

    if (visibleMusicWidth === 0 || previousBarWidth === 0 || nextBarWidth === 0) {
      return;
    }

    const centerPixelBeforeZoom = container.scrollLeft + visibleMusicWidth / 2;
    const anchorBeat = (centerPixelBeforeZoom / previousBarWidth) * timeSignature.numerator;
    const targetPixel = (anchorBeat / timeSignature.numerator) * nextBarWidth;
    const targetScrollLeft = targetPixel - visibleMusicWidth / 2;
    const clampedScrollLeft = Math.max(0, Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth));

    expectedScrollLeftRef.current = clampedScrollLeft;
    container.scrollLeft = clampedScrollLeft;
  }, [barWidthMultiplier, timeSignature]);

  useEffect(() => {
    const container = mainContentRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (!isPlayingRef.current) {
        return;
      }
      if (Math.abs(container.scrollLeft - expectedScrollLeftRef.current) < 1) {
        return;
      }
      useProjectStore.getState().setAutoScrollEnabled(false);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isPlaying || !autoScrollEnabled) {
      return;
    }

    const container = mainContentRef.current;
    if (!container) {
      return;
    }

    const beatsPerBar = timeSignature.numerator;
    const barPosition = playheadPosition / beatsPerBar;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width'),
      10
    ) || 40;
    const playheadPixel = barPosition * barWidth;
    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width'),
      10
    ) || 200;
    const targetScrollLeft = playheadPixel - (container.clientWidth - infoWidth) / 2;
    const clampedScrollLeft = Math.max(0, Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth));

    expectedScrollLeftRef.current = clampedScrollLeft;
    container.scrollLeft = clampedScrollLeft;
  }, [autoScrollEnabled, isPlaying, playheadPosition, timeSignature]);

  useEffect(() => {
    if (mainContentScrollRequest === null) {
      return;
    }

    const container = mainContentRef.current;
    if (!container) {
      return;
    }

    const beatsPerBar = timeSignature.numerator;
    const barPosition = mainContentScrollRequest / beatsPerBar;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width'),
      10
    ) || 40;
    const playheadPixel = barPosition * barWidth;
    const infoWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width'),
      10
    ) || 200;
    const targetScrollLeft = playheadPixel - (container.clientWidth - infoWidth) / 2;
    const clampedScrollLeft = Math.max(0, Math.min(targetScrollLeft, container.scrollWidth - container.clientWidth));

    container.scrollLeft = clampedScrollLeft;
    useProjectStore.setState({ mainContentScrollRequest: null });
  }, [mainContentScrollRequest, timeSignature]);

  useEffect(() => {
    const editingRegionId = editingRegionIds[0] ?? null;
    if (!editingRegionId) {
      return;
    }

    const container = mainContentRef.current;
    if (!container) {
      return;
    }

    const editingRegion = findProjectRegionById(editingRegionId);
    if (!(editingRegion instanceof KGGlobalRegion)) {
      return;
    }

    const barWidth = TOOLBAR_CONSTANTS.BASE_BAR_WIDTH * barWidthMultiplier;
    const leftInset = (parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-info-panel-width'),
      10
    ) || 200) + 12;
    const regionStartBeat = editingRegion instanceof KGTempoRegion || editingRegion instanceof KGKeySignatureRegion
      ? editingRegion.getStartBar() * timeSignature.numerator
      : editingRegion.getStartFromBeat();
    const regionStartPixel = (regionStartBeat / timeSignature.numerator) * barWidth;
    const minimumVisiblePixel = container.scrollLeft + leftInset;

    if (regionStartPixel >= minimumVisiblePixel) {
      return;
    }

    const targetScrollLeft = Math.max(0, regionStartPixel - leftInset);
    requestAnimationFrame(() => {
      if (mainContentRef.current) {
        mainContentRef.current.scrollLeft = targetScrollLeft;
      }
    });
  }, [barWidthMultiplier, editingRegionIds, findProjectRegionById, timeSignature.numerator]);

  const calculatePlayheadFromMouse = useCallback((clientX: number): number | null => {
    if (!barNumbersRef.current) {
      return null;
    }

    const rect = barNumbersRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width'),
      10
    ) || 40;
    const snap = KGMainContentState.instance().isSnappingEnabled();
    const barIndex = snap ? Math.round(relativeX / barWidth) : relativeX / barWidth;
    const clampedBarIndex = Math.max(0, barIndex);
    return clampedBarIndex * timeSignature.numerator;
  }, [timeSignature]);

  const calculateBarIndexFromMouse = useCallback((clientX: number): number | null => {
    if (!barNumbersRef.current) {
      return null;
    }

    const rect = barNumbersRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const barWidth = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--track-grid-bar-width'),
      10
    ) || 40;
    const barIndex = Math.floor(relativeX / barWidth);
    return Math.max(0, Math.min(barIndex, maxBars - 1));
  }, [maxBars]);

  const handleBarNumbersMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const startBarIndex = calculateBarIndexFromMouse(event.clientX);
    if (startBarIndex === null) {
      return;
    }

    isLoopDraggingRef.current = true;
    loopDragStartBarRef.current = startBarIndex;
    loopDragStartXRef.current = event.clientX;
    loopDragOriginalSettingsRef.current = {
      isLooping,
      loopingRange: [...loopingRange] as [number, number],
    };

    if (DEBUG_MODE.MAIN_CONTENT) {
      console.log(`Bar numbers mouse down - Start bar: ${startBarIndex} (displayed as bar ${startBarIndex + 1})`);
    }

    event.preventDefault();
  }, [calculateBarIndexFromMouse, isLooping, loopingRange]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isLoopDraggingRef.current) {
        return;
      }
      if (loopDragStartBarRef.current === null || loopDragStartXRef.current === null) {
        return;
      }

      const distanceMoved = Math.abs(event.clientX - loopDragStartXRef.current);
      if (distanceMoved < BAR_NUMBERS_CONSTANTS.DRAG_THRESHOLD) {
        return;
      }

      const currentBarIndex = calculateBarIndexFromMouse(event.clientX);
      if (currentBarIndex === null) {
        return;
      }

      const startBar = loopDragStartBarRef.current;
      const loopStart = Math.min(startBar, currentBarIndex);
      const loopEnd = Math.max(startBar, currentBarIndex);
      const newLoopRange: [number, number] = [loopStart, loopEnd];

      const project = KGCore.instance().getCurrentProject();
      project.setLoopingRange(newLoopRange);
      project.setIsLooping(true);
      useProjectStore.setState({ loopingRange: newLoopRange, isLooping: true });

      if (DEBUG_MODE.MAIN_CONTENT) {
        console.log(`Loop range drag - Range: [${loopStart}, ${loopEnd}] (bars ${loopStart + 1}-${loopEnd + 1})`);
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (!isLoopDraggingRef.current) {
        return;
      }

      if (loopDragStartXRef.current !== null) {
        const distanceMoved = Math.abs(event.clientX - loopDragStartXRef.current);

        if (distanceMoved >= BAR_NUMBERS_CONSTANTS.DRAG_THRESHOLD) {
          const core = KGCore.instance();
          const currentIsLooping = core.getCurrentProject().getIsLooping();
          const currentLoopingRange = core.getCurrentProject().getLoopingRange();

          if (loopDragOriginalSettingsRef.current) {
            const originalSettings = loopDragOriginalSettingsRef.current;
            const settingsChanged =
              originalSettings.isLooping !== currentIsLooping ||
              originalSettings.loopingRange[0] !== currentLoopingRange[0] ||
              originalSettings.loopingRange[1] !== currentLoopingRange[1];

            if (settingsChanged) {
              const { isPlaying: currentIsPlaying, stopPlaying } = useProjectStore.getState();
              if (currentIsPlaying) {
                stopPlaying();
              }

              core.getCurrentProject().setIsLooping(originalSettings.isLooping);
              core.getCurrentProject().setLoopingRange(originalSettings.loopingRange);
              core.executeCommand(new ChangeLoopSettingsCommand({
                isLooping: currentIsLooping,
                loopingRange: currentLoopingRange,
              }));

              if (DEBUG_MODE.MAIN_CONTENT) {
                console.log('Loop range drag ended - Command executed for undo/redo');
              }
            }
          }
        } else {
          const clickPosition = calculatePlayheadFromMouse(event.clientX);
          if (clickPosition !== null) {
            setPlayheadPosition(clickPosition);
            requestPianoRollScroll(clickPosition);

            if (DEBUG_MODE.MAIN_CONTENT) {
              console.log(`Single click on bar numbers - Set playhead to: ${clickPosition}`);
            }
          }
        }
      }

      isLoopDraggingRef.current = false;
      loopDragStartBarRef.current = null;
      loopDragStartXRef.current = null;
      loopDragOriginalSettingsRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [calculateBarIndexFromMouse, calculatePlayheadFromMouse, requestPianoRollScroll, setPlayheadPosition]);

  const isBarInLoopRange = useCallback((barIndex: number) => {
    if (!isLooping) {
      return false;
    }
    return barIndex >= loopingRange[0] && barIndex <= loopingRange[1];
  }, [isLooping, loopingRange]);

  return {
    mainContentRef,
    barNumbersRef,
    handleBarNumbersMouseDown,
    isBarInLoopRange,
  };
}
