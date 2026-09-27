import { TOOLBAR_CONSTANTS } from '../../constants';
import type { SheetMeasureMetric } from './sheetNotationTypes';
import { getSheetPlayheadPixel } from './sheetNotation';
import { ticksToPixels } from '../../core/timing';

export type RegionPlayheadRelation = 'before' | 'inside' | 'after';
type ViewportSwitchAlignment = 'center' | 'region-start' | 'region-end';
type ViewportClampScope = 'region' | 'track';

export interface PendingModeSwitchRequest {
  sourceSheetMusicViewEnabled: boolean;
  destinationSheetMusicViewEnabled: boolean;
  destinationSheetMusicTrackScopeEnabled: boolean;
  alignment: ViewportSwitchAlignment;
  anchorBeat: number;
  clampScope: ViewportClampScope;
  destinationHasPianoKeys?: boolean;
}

export interface RegionSwitchRequestOptions {
  playheadBeat: number;
  regionStartTick: number;
  regionEndTick: number;
  sourceSheetMusicViewEnabled: boolean;
  destinationSheetMusicViewEnabled: boolean;
  destinationSheetMusicTrackScopeEnabled: boolean;
  destinationHasPianoKeys: boolean;
}

export interface ModeSwitchRequestOptions {
  playheadBeat: number;
  regionStartTick: number;
  regionEndTick: number;
  sourceSheetMusicViewEnabled: boolean;
  destinationSheetMusicViewEnabled: boolean;
  destinationSheetMusicTrackScopeEnabled: boolean;
}

export interface ScrollLeftForViewportRequestOptions {
  request: PendingModeSwitchRequest;
  container: HTMLDivElement;
  sheetMeasureMetrics: SheetMeasureMetric[];
  activeRegionStartTick: number;
  activeRegionEndTick: number;
  songEndTick: number;
}

export function getRegionPlayheadRelation(
  playheadBeat: number,
  regionStartTick: number,
  regionEndTick: number
): RegionPlayheadRelation {
  if (playheadBeat < regionStartTick) {
    return 'before';
  }

  if (playheadBeat > regionEndTick) {
    return 'after';
  }

  return 'inside';
}

export function createPendingModeSwitchRequest({
  playheadBeat,
  regionStartTick,
  regionEndTick,
  sourceSheetMusicViewEnabled,
  destinationSheetMusicViewEnabled,
  destinationSheetMusicTrackScopeEnabled,
}: ModeSwitchRequestOptions): PendingModeSwitchRequest {
  const relation = getRegionPlayheadRelation(playheadBeat, regionStartTick, regionEndTick);
  const enteringTrackScopeSheet = (
    !sourceSheetMusicViewEnabled &&
    destinationSheetMusicViewEnabled &&
    destinationSheetMusicTrackScopeEnabled
  );

  if (relation === 'inside') {
    return {
      sourceSheetMusicViewEnabled,
      destinationSheetMusicViewEnabled,
      destinationSheetMusicTrackScopeEnabled,
      alignment: 'center',
      anchorBeat: playheadBeat,
      clampScope: destinationSheetMusicTrackScopeEnabled ? 'track' : 'region',
    };
  }

  if (enteringTrackScopeSheet) {
    return {
      sourceSheetMusicViewEnabled,
      destinationSheetMusicViewEnabled,
      destinationSheetMusicTrackScopeEnabled,
      alignment: 'center',
      anchorBeat: playheadBeat,
      clampScope: 'track',
    };
  }

  return {
    sourceSheetMusicViewEnabled,
    destinationSheetMusicViewEnabled,
    destinationSheetMusicTrackScopeEnabled,
    alignment: relation === 'before' ? 'region-start' : 'region-end',
    anchorBeat: relation === 'before' ? regionStartTick : regionEndTick,
    clampScope: 'region',
  };
}

export function createPendingRegionSwitchRequest({
  playheadBeat,
  regionStartTick,
  regionEndTick,
  sourceSheetMusicViewEnabled,
  destinationSheetMusicViewEnabled,
  destinationSheetMusicTrackScopeEnabled,
  destinationHasPianoKeys,
}: RegionSwitchRequestOptions): PendingModeSwitchRequest | null {
  if (getRegionPlayheadRelation(playheadBeat, regionStartTick, regionEndTick) !== 'inside') {
    return null;
  }

  return {
    sourceSheetMusicViewEnabled,
    destinationSheetMusicViewEnabled,
    destinationSheetMusicTrackScopeEnabled,
    destinationHasPianoKeys,
    alignment: 'center',
    anchorBeat: playheadBeat,
    clampScope: 'track',
  };
}

function getHorizontalViewportMetrics(
  container: HTMLDivElement,
  sheetMusicViewEnabled: boolean,
  hasPianoKeys: boolean
): {
  visibleWidth: number;
  keysWidth: number;
} {
  const keysWidth = sheetMusicViewEnabled || !hasPianoKeys
    ? 0
    : (parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--region-piano-key-width')
      ) || 60);

  return {
    visibleWidth: Math.max(0, container.clientWidth - keysWidth),
    keysWidth,
  };
}

function getPixelForAbsoluteTick(
  beat: number,
  sheetMusicViewEnabled: boolean,
  sheetMusicTrackScopeEnabled: boolean,
  sheetMeasureMetrics: SheetMeasureMetric[],
  activeRegionStartTick: number
): number {
  if (sheetMusicViewEnabled) {
    return getSheetPlayheadPixel(
      sheetMusicTrackScopeEnabled
        ? Math.max(0, beat)
        : Math.max(0, beat - activeRegionStartTick),
      sheetMeasureMetrics
    );
  }

  const beatWidth = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
  ) || 40;
  return ticksToPixels(beat, beatWidth);
}

function getScopeBoundsInPixels(
  request: PendingModeSwitchRequest,
  sheetMeasureMetrics: SheetMeasureMetric[],
  activeRegionStartTick: number,
  activeRegionEndTick: number,
  songEndTick: number
): { startPx: number; endPx: number } {
  if (request.destinationSheetMusicViewEnabled) {
    if (request.clampScope === 'track') {
      return {
        startPx: getSheetPlayheadPixel(0, sheetMeasureMetrics),
        endPx: getSheetPlayheadPixel(songEndTick, sheetMeasureMetrics),
      };
    }

    return {
      startPx: getSheetPlayheadPixel(0, sheetMeasureMetrics),
      endPx: getSheetPlayheadPixel(activeRegionEndTick - activeRegionStartTick, sheetMeasureMetrics),
    };
  }

  const beatWidth = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
  ) || 40;

  if (request.clampScope === 'track') {
    return {
      startPx: 0,
      endPx: ticksToPixels(songEndTick, beatWidth),
    };
  }

  return {
    startPx: ticksToPixels(activeRegionStartTick, beatWidth),
    endPx: ticksToPixels(activeRegionEndTick, beatWidth),
  };
}

function clampScrollLeftToContainer(container: HTMLDivElement, scrollLeft: number): number {
  return Math.max(0, Math.min(scrollLeft, container.scrollWidth - container.clientWidth));
}

function getCenteredScrollLeft({
  pixelPosition,
  visibleWidth,
  scopeStartPx,
  scopeEndPx,
  container,
}: {
  pixelPosition: number;
  visibleWidth: number;
  scopeStartPx: number;
  scopeEndPx: number;
  container: HTMLDivElement;
}): number {
  const unclamped = pixelPosition - visibleWidth / 2;
  const maxScopeScrollLeft = Math.max(scopeStartPx, scopeEndPx - visibleWidth);
  const clampedToScope = Math.max(scopeStartPx, Math.min(unclamped, maxScopeScrollLeft));
  return clampScrollLeftToContainer(container, clampedToScope);
}

function getRegionEndAlignedScrollLeft({
  visibleWidth,
  scopeEndPx,
  container,
}: {
  visibleWidth: number;
  scopeEndPx: number;
  container: HTMLDivElement;
}): number {
  return clampScrollLeftToContainer(container, Math.max(0, scopeEndPx - visibleWidth));
}

export function getScrollLeftForViewportRequest({
  request,
  container,
  sheetMeasureMetrics,
  activeRegionStartTick,
  activeRegionEndTick,
  songEndTick,
}: ScrollLeftForViewportRequestOptions): number {
  const { visibleWidth } = getHorizontalViewportMetrics(
    container,
    request.destinationSheetMusicViewEnabled,
    request.destinationHasPianoKeys ?? !request.destinationSheetMusicViewEnabled
  );
  const pixelPosition = getPixelForAbsoluteTick(
    request.anchorBeat,
    request.destinationSheetMusicViewEnabled,
    request.destinationSheetMusicTrackScopeEnabled,
    sheetMeasureMetrics,
    activeRegionStartTick
  );
  const { startPx, endPx } = getScopeBoundsInPixels(
    request,
    sheetMeasureMetrics,
    activeRegionStartTick,
    activeRegionEndTick,
    songEndTick
  );

  if (request.alignment === 'region-start') {
    return clampScrollLeftToContainer(container, startPx);
  }

  if (request.alignment === 'region-end') {
    return getRegionEndAlignedScrollLeft({
      visibleWidth,
      scopeEndPx: endPx,
      container,
    });
  }

  return getCenteredScrollLeft({
    pixelPosition,
    visibleWidth,
    scopeStartPx: startPx,
    scopeEndPx: endPx,
    container,
  });
}

export function getRegionStartScrollLeft(startTick: number): number {
  const beatWidth = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--region-grid-beat-width')
  ) || TOOLBAR_CONSTANTS.BASE_BAR_WIDTH;

  return Math.max(0, ticksToPixels(startTick, beatWidth));
}
