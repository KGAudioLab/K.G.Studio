import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      maxBars: 8,
      tracks: [],
      updateTrack: vi.fn(),
      timeSignature: { numerator: 4, denominator: 4 },
      showChatBox: false,
      showKGOnePanel: false,
      showEventListPanel: false,
      showInstrumentSelection: false,
      keySignature: 'C major',
      selectedMode: 'ionian',
      setSelectedMode: vi.fn(),
      playheadPosition: 0,
      isPlaying: false,
      autoScrollEnabled: false,
      bpm: 120,
      pianoRollScrollRequest: null,
      selectedNoteIds: [],
      automationRedrawVersion: 0,
    }),
    {
      getState: () => ({
        setAutoScrollEnabled: vi.fn(),
      }),
      setState: vi.fn(),
    }
  ),
}));

import {
  createPendingModeSwitchRequest,
  getRegionStartScrollLeft,
  getRegionPlayheadRelation,
  getScrollLeftForViewportRequest,
} from './pianoRollViewport';
import type { SheetMeasureMetric } from './sheetNotationTypes';

function createContainer({ clientWidth, scrollWidth }: { clientWidth: number; scrollWidth: number }): HTMLDivElement {
  return {
    clientWidth,
    scrollWidth,
  } as HTMLDivElement;
}

describe('PianoRoll viewport switch helpers', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
    document.documentElement.style.setProperty('--region-piano-key-width', '60px');
  });

  it('classifies playhead position relative to the active region', () => {
    expect(getRegionPlayheadRelation(15, 16, 24)).toBe('before');
    expect(getRegionPlayheadRelation(20, 16, 24)).toBe('inside');
    expect(getRegionPlayheadRelation(25, 16, 24)).toBe('after');
  });

  it('uses the zoomed beat width when scrolling to a different region in piano-roll view', () => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '80px');
    document.documentElement.style.setProperty('--region-grid-bar-width', 'calc(var(--region-grid-beat-width) * var(--time-signature-numerator))');

    expect(getRegionStartScrollLeft(16)).toBe(1280);
  });

  it('centers an in-region playhead when switching to region-scope sheet view', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 20,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'center',
      anchorBeat: 20,
      clampScope: 'region',
    });

    const metrics: SheetMeasureMetric[] = [
      { barIndex: 0, startBeat: 0, endBeat: 4, leftPx: 0, widthPx: 200 },
      { barIndex: 1, startBeat: 4, endBeat: 8, leftPx: 200, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 400 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 32,
    });

    expect(scrollLeft).toBe(100);
  });

  it('snaps to the region start when the playhead is before the active region', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 12,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: true,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'region-start',
      anchorBeat: 16,
      clampScope: 'region',
    });

    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 260, scrollWidth: 2000 }),
      sheetMeasureMetrics: [],
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 32,
    });

    expect(scrollLeft).toBe(640);
  });

  it('snaps to the region end when the playhead is after the active region', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: true,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'region-end',
      anchorBeat: 24,
      clampScope: 'region',
    });

    const metrics: SheetMeasureMetric[] = [
      { barIndex: 0, startBeat: 0, endBeat: 4, leftPx: 0, widthPx: 200 },
      { barIndex: 1, startBeat: 4, endBeat: 8, leftPx: 200, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 400 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 32,
    });

    expect(scrollLeft).toBe(200);
  });

  it('uses the track-scope special case only when entering sheet music from piano roll', () => {
    const specialCaseRequest = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: true,
    });
    const regularTrackScopeRequest = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: true,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: true,
    });

    expect(specialCaseRequest).toMatchObject({
      alignment: 'center',
      anchorBeat: 28,
      clampScope: 'track',
    });
    expect(regularTrackScopeRequest).toMatchObject({
      alignment: 'region-end',
      anchorBeat: 24,
      clampScope: 'region',
    });
  });

  it('treats sheet-music to piano-roll switches as region-scoped even when source sheet view was track-scoped', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 20,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: true,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'center',
      anchorBeat: 20,
      clampScope: 'region',
    });
  });

  it('clamps centered piano-roll scroll at the start and end of the active region', () => {
    const container = createContainer({ clientWidth: 260, scrollWidth: 2000 });
    const startClamp = getScrollLeftForViewportRequest({
      request: {
        sourceSheetMusicViewEnabled: false,
        destinationSheetMusicViewEnabled: false,
        destinationSheetMusicTrackScopeEnabled: false,
        alignment: 'center',
        anchorBeat: 16,
        clampScope: 'region',
      },
      container,
      sheetMeasureMetrics: [],
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 32,
    });
    const endClamp = getScrollLeftForViewportRequest({
      request: {
        sourceSheetMusicViewEnabled: false,
        destinationSheetMusicViewEnabled: false,
        destinationSheetMusicTrackScopeEnabled: false,
        alignment: 'center',
        anchorBeat: 24,
        clampScope: 'region',
      },
      container,
      sheetMeasureMetrics: [],
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 32,
    });

    expect(startClamp).toBe(640);
    expect(endClamp).toBe(760);
  });

  it('centers the playhead in track-scope sheet view with song-bound clamping', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 14,
      regionStartBeat: 16,
      regionEndBeat: 24,
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: true,
    });
    const metrics: SheetMeasureMetric[] = [
      { barIndex: 0, startBeat: 0, endBeat: 4, leftPx: 0, widthPx: 200 },
      { barIndex: 1, startBeat: 4, endBeat: 8, leftPx: 200, widthPx: 200 },
      { barIndex: 2, startBeat: 8, endBeat: 12, leftPx: 400, widthPx: 200 },
      { barIndex: 3, startBeat: 12, endBeat: 16, leftPx: 600, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 800 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartBeat: 16,
      activeRegionEndBeat: 24,
      songEndBeat: 16,
    });

    expect(scrollLeft).toBe(600);
  });
});
