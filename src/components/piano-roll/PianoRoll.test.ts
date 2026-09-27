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
      playheadTick: 0,
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
  createPendingRegionSwitchRequest,
  getRegionStartScrollLeft,
  getRegionPlayheadRelation,
  getScrollLeftForViewportRequest,
} from './pianoRollViewport';
import type { SheetMeasureMetric } from './sheetNotationTypes';
import { quarterNotesToTicks } from '../../core/timing';

const q = quarterNotesToTicks;

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
    expect(getRegionPlayheadRelation(q(15), q(16), q(24))).toBe('before');
    expect(getRegionPlayheadRelation(q(20), q(16), q(24))).toBe('inside');
    expect(getRegionPlayheadRelation(q(25), q(16), q(24))).toBe('after');
  });

  it('uses the zoomed beat width when scrolling to a different region in piano-roll view', () => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '80px');
    document.documentElement.style.setProperty('--region-grid-bar-width', 'calc(var(--region-grid-beat-width) * var(--time-signature-numerator))');

    expect(getRegionStartScrollLeft(q(16))).toBe(1280);
  });

  it('creates a song-scoped center request only when the playhead is inside the switched region', () => {
    const options = {
      regionStartTick: q(16),
      regionEndTick: q(24),
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
      destinationHasPianoKeys: true,
    };

    expect(createPendingRegionSwitchRequest({ ...options, playheadBeat: q(15) })).toBeNull();
    expect(createPendingRegionSwitchRequest({ ...options, playheadBeat: q(25) })).toBeNull();
    expect(createPendingRegionSwitchRequest({ ...options, playheadBeat: q(16) })).toMatchObject({
      alignment: 'center',
      anchorBeat: q(16),
      clampScope: 'track',
    });
    expect(createPendingRegionSwitchRequest({ ...options, playheadBeat: q(24) })).toMatchObject({
      alignment: 'center',
      anchorBeat: q(24),
      clampScope: 'track',
    });
  });

  it('centers a switched-region playhead using zoom and the destination key gutter', () => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '80px');
    const request = createPendingRegionSwitchRequest({
      playheadBeat: q(16),
      regionStartTick: q(12),
      regionEndTick: q(20),
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
      destinationHasPianoKeys: true,
    });

    expect(request).not.toBeNull();
    expect(getScrollLeftForViewportRequest({
      request: request!,
      container: createContainer({ clientWidth: 260, scrollWidth: 2620 }),
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(12),
      activeRegionEndTick: q(20),
      songEndTick: q(32),
    })).toBe(1180);
  });

  it('clamps switched-region centering at both song boundaries', () => {
    const container = createContainer({ clientWidth: 260, scrollWidth: 1340 });
    const createRequest = (quarterNote: number) => createPendingRegionSwitchRequest({
      playheadBeat: q(quarterNote),
      regionStartTick: q(quarterNote),
      regionEndTick: q(quarterNote + 1),
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
      destinationHasPianoKeys: true,
    })!;

    expect(getScrollLeftForViewportRequest({
      request: createRequest(1),
      container,
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(1),
      activeRegionEndTick: q(2),
      songEndTick: q(32),
    })).toBe(0);
    expect(getScrollLeftForViewportRequest({
      request: createRequest(31),
      container,
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(31),
      activeRegionEndTick: q(32),
      songEndTick: q(32),
    })).toBe(1080);
  });

  it('centers audio-waveform destinations without a piano-key gutter', () => {
    const request = createPendingRegionSwitchRequest({
      playheadBeat: q(16),
      regionStartTick: q(12),
      regionEndTick: q(20),
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
      destinationHasPianoKeys: false,
    })!;

    expect(getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 260, scrollWidth: 1280 }),
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(12),
      activeRegionEndTick: q(20),
      songEndTick: q(32),
    })).toBe(510);
  });

  it('centers an in-region playhead when switching to region-scope sheet view', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: q(20),
      regionStartTick: q(16),
      regionEndTick: q(24),
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'center',
      anchorBeat: q(20),
      clampScope: 'region',
    });

    const metrics: SheetMeasureMetric[] = [
      { barIndex: 0, startTick: 0, endTick: q(4), leftPx: 0, widthPx: 200 },
      { barIndex: 1, startTick: q(4), endTick: q(8), leftPx: 200, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 400 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartTick: q(16),
      activeRegionEndTick: q(24),
      songEndTick: q(32),
    });

    expect(scrollLeft).toBe(100);
  });

  it('snaps to the region start when the playhead is before the active region', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: q(12),
      regionStartTick: q(16),
      regionEndTick: q(24),
      sourceSheetMusicViewEnabled: true,
      destinationSheetMusicViewEnabled: false,
      destinationSheetMusicTrackScopeEnabled: false,
    });

    expect(request).toMatchObject({
      alignment: 'region-start',
      anchorBeat: q(16),
      clampScope: 'region',
    });

    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 260, scrollWidth: 2000 }),
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(16),
      activeRegionEndTick: q(24),
      songEndTick: q(32),
    });

    expect(scrollLeft).toBe(640);
  });

  it('snaps to the region end when the playhead is after the active region', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartTick: 16,
      regionEndTick: 24,
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
      { barIndex: 0, startTick: 0, endTick: 4, leftPx: 0, widthPx: 200 },
      { barIndex: 1, startTick: 4, endTick: 8, leftPx: 200, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 400 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartTick: 16,
      activeRegionEndTick: 24,
      songEndTick: 32,
    });

    expect(scrollLeft).toBe(200);
  });

  it('uses the track-scope special case only when entering sheet music from piano roll', () => {
    const specialCaseRequest = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartTick: 16,
      regionEndTick: 24,
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: true,
    });
    const regularTrackScopeRequest = createPendingModeSwitchRequest({
      playheadBeat: 28,
      regionStartTick: 16,
      regionEndTick: 24,
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
      regionStartTick: 16,
      regionEndTick: 24,
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
        anchorBeat: q(16),
        clampScope: 'region',
      },
      container,
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(16),
      activeRegionEndTick: q(24),
      songEndTick: q(32),
    });
    const endClamp = getScrollLeftForViewportRequest({
      request: {
        sourceSheetMusicViewEnabled: false,
        destinationSheetMusicViewEnabled: false,
        destinationSheetMusicTrackScopeEnabled: false,
        alignment: 'center',
        anchorBeat: q(24),
        clampScope: 'region',
      },
      container,
      sheetMeasureMetrics: [],
      activeRegionStartTick: q(16),
      activeRegionEndTick: q(24),
      songEndTick: q(32),
    });

    expect(startClamp).toBe(640);
    expect(endClamp).toBe(760);
  });

  it('centers the playhead in track-scope sheet view with song-bound clamping', () => {
    const request = createPendingModeSwitchRequest({
      playheadBeat: 14,
      regionStartTick: 16,
      regionEndTick: 24,
      sourceSheetMusicViewEnabled: false,
      destinationSheetMusicViewEnabled: true,
      destinationSheetMusicTrackScopeEnabled: true,
    });
    const metrics: SheetMeasureMetric[] = [
      { barIndex: 0, startTick: 0, endTick: 4, leftPx: 0, widthPx: 200 },
      { barIndex: 1, startTick: 4, endTick: 8, leftPx: 200, widthPx: 200 },
      { barIndex: 2, startTick: 8, endTick: 12, leftPx: 400, widthPx: 200 },
      { barIndex: 3, startTick: 12, endTick: 16, leftPx: 600, widthPx: 200 },
    ];
    const scrollLeft = getScrollLeftForViewportRequest({
      request,
      container: createContainer({ clientWidth: 200, scrollWidth: 800 }),
      sheetMeasureMetrics: metrics,
      activeRegionStartTick: 16,
      activeRegionEndTick: 24,
      songEndTick: 16,
    });

    expect(scrollLeft).toBe(600);
  });
});
