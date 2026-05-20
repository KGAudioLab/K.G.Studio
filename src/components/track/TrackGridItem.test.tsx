import React, { useState } from 'react';
import { act, render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TrackGridItem from './TrackGridItem';
import { KGAudioTrack } from '../../core/track/KGAudioTrack';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';
import type { RegionPreviewContentStyle } from '../interfaces';

const storeState = {
  selectedRegionIds: [] as string[],
  activeTrackAutomationTrackId: null as string | null,
  activeTrackAutomationType: null,
  trackAutomationRedrawVersion: 0,
  recordingMode: 'audio' as 'audio' | 'midi' | null,
  recordingTargetTrackIndex: 0,
  recordingCommitStartBeatAbsolute: 4,
  recordingAudioPreviewCurrentBeat: 8,
  recordingAudioPreviewPeaks: [{ min: -0.5, max: 0.5 }],
  recordingAudioPreviewFileName: 'Recording' as string | null,
  timeSignature: { numerator: 4, denominator: 4 },
};

const regionItemProps = new Map<string, Record<string, unknown>>();

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: typeof storeState) => unknown) => (
    selector ? selector(storeState) : storeState
  ),
}));

vi.mock('./RegionItem', () => ({
  default: (props: Record<string, unknown>) => {
    regionItemProps.set(props.id as string, props);
    return (
      <div
        data-region-id={props.id as string}
        data-preview-region={(props.isPreview as boolean | undefined) ? 'true' : 'false'}
        style={props.style as React.CSSProperties}
      />
    );
  },
}));

vi.mock('./TrackAutomationLane', () => ({
  default: () => null,
}));

vi.mock('../../core/audio-interface/KGAudioInterface', () => ({
  KGAudioInterface: {
    instance: () => ({
      getAudioBuffer: () => undefined,
    }),
  },
}));

describe('TrackGridItem preview behavior', () => {
  const getRegionItem = (regionId: string) => regionItemProps.get(regionId) as {
    style: React.CSSProperties;
    previewContentStyle?: RegionPreviewContentStyle;
    onResizeStart?: (regionId: string, resizeAction: 'start' | 'end', initialX: number) => void;
    onResize?: (regionId: string, resizeAction: 'start' | 'end', deltaX: number) => void;
    onResizeEnd?: (regionId: string, resizeAction: 'start' | 'end') => void;
    onDragStart?: (regionId: string, initialX: number, initialY: number) => void;
    onDrag?: (regionId: string, deltaX: number, deltaY: number) => void;
    onDragEnd?: (regionId: string) => void;
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      })),
    });

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  beforeEach(() => {
    regionItemProps.clear();
    storeState.selectedRegionIds = [];
    storeState.activeTrackAutomationTrackId = null;
    storeState.activeTrackAutomationType = null;
    storeState.trackAutomationRedrawVersion = 0;
    storeState.recordingMode = 'audio';
    storeState.recordingTargetTrackIndex = 0;
    storeState.recordingCommitStartBeatAbsolute = 4;
    storeState.recordingAudioPreviewCurrentBeat = 8;
    storeState.recordingAudioPreviewPeaks = [{ min: -0.5, max: 0.5 }];
    storeState.recordingAudioPreviewFileName = 'Recording';
    storeState.timeSignature = { numerator: 4, denominator: 4 };
    KGMainContentState.instance().setActiveTool('pointer');
    KGMainContentState.instance().setSnapping(true);
  });

  const createGridContainerRef = () => {
    const gridElement = document.createElement('div');
    Object.defineProperty(gridElement, 'clientWidth', { configurable: true, value: 800 });
    Object.defineProperty(gridElement, 'clientHeight', { configurable: true, value: 240 });
    return { current: gridElement };
  };

  const renderSharedPreviewHarness = (
    selectedRegionIds: string[] = [],
    regionOverrides: Array<{ id: string; trackId: string; trackIndex: number; barNumber: number; length: number; name: string }> = [
      { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 1, length: 1, name: 'Region A' },
      { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 3, length: 2, name: 'Region B' },
    ],
  ) => {
    storeState.selectedRegionIds = selectedRegionIds;

    const regionAData = regionOverrides.find(region => region.id === 'region-a')!;
    const regionBData = regionOverrides.find(region => region.id === 'region-b')!;
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: (regionAData.barNumber - 1) * 4, length: regionAData.length * 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '2', trackIndex: 1, startFromBeat: (regionBData.barNumber - 1) * 4, length: regionBData.length * 4 });
    const trackA = createMockMidiTrack({ id: 1, regions: [regionA] });
    const trackB = createMockMidiTrack({ id: 2, regions: [regionB] });
    trackA.setTrackIndex(0);
    trackB.setTrackIndex(1);

    const gridContainerRef = createGridContainerRef();
    const baseProps = {
      isDragging: false,
      isDragOver: false,
      regions: regionOverrides,
      maxBars: 8,
      selectedRegionId: null,
      gridContainerRef,
      onDoubleClick: vi.fn(),
      onRegionResize: vi.fn(),
      onRegionResizeEnd: vi.fn(),
      onRegionDrag: vi.fn(),
      onRegionDragEnd: vi.fn(),
      allTracks: [trackA, trackB],
    };

    const SharedPreviewHarness = () => {
      const [previewRegionStyles, setPreviewRegionStyles] = useState<Record<string, React.CSSProperties>>({});
      const [previewRegionContentStyles, setPreviewRegionContentStyles] = useState<Record<string, RegionPreviewContentStyle>>({});

      return (
        <>
          <TrackGridItem
            track={trackA}
            index={0}
            previewRegionStyles={previewRegionStyles}
            setPreviewRegionStyles={setPreviewRegionStyles}
            previewRegionContentStyles={previewRegionContentStyles}
            setPreviewRegionContentStyles={setPreviewRegionContentStyles}
            {...baseProps}
          />
          <TrackGridItem
            track={trackB}
            index={1}
            previewRegionStyles={previewRegionStyles}
            setPreviewRegionStyles={setPreviewRegionStyles}
            previewRegionContentStyles={previewRegionContentStyles}
            setPreviewRegionContentStyles={setPreviewRegionContentStyles}
            {...baseProps}
          />
        </>
      );
    };

    render(<SharedPreviewHarness />);

    return baseProps;
  };

  it('renders a non-interactive preview region on the recording audio track', () => {
    const track = new KGAudioTrack('Audio Track', 1);
    track.setTrackIndex(0);

    render(
      <TrackGridItem
        track={track}
        index={0}
        isDragging={false}
        isDragOver={false}
        regions={[]}
        maxBars={8}
        selectedRegionId={null}
        gridContainerRef={createGridContainerRef()}
        onDoubleClick={vi.fn()}
      />
    );

    expect(regionItemProps.get('audio-recording-preview')).toBeTruthy();
  });

  it('previews end resize for all selected regions across track rows', () => {
    renderSharedPreviewHarness(['region-a', 'region-b']);

    act(() => {
      getRegionItem('region-a').onResizeStart?.('region-a', 'end', 0);
      getRegionItem('region-a').onResize?.('region-a', 'end', 40);
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '0px',
      width: '140px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toEqual({
      left: '0px',
      width: '100px',
    });
    expect(getRegionItem('region-b').style).toEqual({
      left: '200px',
      width: '240px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toEqual({
      left: '0px',
      width: '200px',
    });
  });

  it('previews start resize for all selected regions across track rows', () => {
    renderSharedPreviewHarness(
      ['region-a', 'region-b'],
      [
        { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 2, length: 2, name: 'Region A' },
        { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 4, length: 3, name: 'Region B' },
      ],
    );

    act(() => {
      getRegionItem('region-a').onResizeStart?.('region-a', 'start', 0);
      getRegionItem('region-a').onResize?.('region-a', 'start', 40);
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '140px',
      width: '160px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toEqual({
      left: '-40px',
      width: '200px',
    });
    expect(getRegionItem('region-b').style).toEqual({
      left: '340px',
      width: '260px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toEqual({
      left: '-40px',
      width: '300px',
    });
  });

  it('keeps preview content fixed while shrinking from the end', () => {
    renderSharedPreviewHarness(
      ['region-a', 'region-b'],
      [
        { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 1, length: 2, name: 'Region A' },
        { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 3, length: 3, name: 'Region B' },
      ],
    );

    act(() => {
      getRegionItem('region-a').onResizeStart?.('region-a', 'end', 0);
      getRegionItem('region-a').onResize?.('region-a', 'end', -40);
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '0px',
      width: '160px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toEqual({
      left: '0px',
      width: '200px',
    });
    expect(getRegionItem('region-b').style).toEqual({
      left: '200px',
      width: '260px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toEqual({
      left: '0px',
      width: '300px',
    });
  });

  it('shifts preview content right when extending from the start', () => {
    renderSharedPreviewHarness(
      ['region-a', 'region-b'],
      [
        { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 2, length: 2, name: 'Region A' },
        { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 4, length: 3, name: 'Region B' },
      ],
    );

    act(() => {
      getRegionItem('region-a').onResizeStart?.('region-a', 'start', 0);
      getRegionItem('region-a').onResize?.('region-a', 'start', -40);
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '60px',
      width: '240px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toEqual({
      left: '40px',
      width: '200px',
    });
    expect(getRegionItem('region-b').style).toEqual({
      left: '260px',
      width: '340px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toEqual({
      left: '40px',
      width: '300px',
    });
  });

  it('previews drag movement for all selected regions across track rows', () => {
    renderSharedPreviewHarness(['region-a', 'region-b']);

    act(() => {
      getRegionItem('region-a').onDragStart?.('region-a', 0, 0);
      getRegionItem('region-a').onDrag?.('region-a', 50, 60);
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '50px',
      width: '100px',
      position: 'absolute',
      zIndex: 100,
      transform: 'translateY(0px)',
    });
    expect(getRegionItem('region-b').style).toEqual({
      left: '250px',
      width: '200px',
      position: 'absolute',
      zIndex: 100,
      transform: 'translateY(0px)',
    });
  });

  it('previews only the grabbed region when it is outside the current selection', () => {
    renderSharedPreviewHarness(['region-a', 'region-b']);

    const regionC = {
      id: 'region-c',
      trackId: '1',
      trackIndex: 0,
      barNumber: 5,
      length: 1,
      name: 'Region C',
    };

    const track = createMockMidiTrack({ id: 1, regions: [createMockMidiRegion({ id: 'region-c', trackId: '1', trackIndex: 0, startFromBeat: 16, length: 4 })] });
    track.setTrackIndex(0);
    const gridContainerRef = createGridContainerRef();

    render(
      <TrackGridItem
        track={track}
        index={0}
        isDragging={false}
        isDragOver={false}
        regions={[regionC]}
        maxBars={8}
        selectedRegionId={null}
        gridContainerRef={gridContainerRef}
        onDoubleClick={vi.fn()}
      />
    );

    act(() => {
      getRegionItem('region-c').onDragStart?.('region-c', 0, 0);
      getRegionItem('region-c').onDrag?.('region-c', 50, 60);
    });

    expect(getRegionItem('region-c').style).toEqual({
      left: '450px',
      width: '100px',
      position: 'absolute',
      zIndex: 100,
      transform: 'translateY(60px)',
    });
  });

  it('clears preview styles for the full cohort after drag and resize end', () => {
    const { onRegionResizeEnd, onRegionDragEnd } = renderSharedPreviewHarness(['region-a', 'region-b']);

    act(() => {
      getRegionItem('region-a').onResizeStart?.('region-a', 'end', 0);
      getRegionItem('region-a').onResize?.('region-a', 'end', 40);
      getRegionItem('region-a').onResizeEnd?.('region-a', 'end');
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '0px',
      width: '100px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toBeUndefined();
    expect(getRegionItem('region-b').style).toEqual({
      left: '200px',
      width: '200px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toBeUndefined();
    expect(onRegionResizeEnd).toHaveBeenCalledWith('region-a', 1, 1);

    act(() => {
      getRegionItem('region-a').onDragStart?.('region-a', 0, 0);
      getRegionItem('region-a').onDrag?.('region-a', 50, 60);
      getRegionItem('region-a').onDragEnd?.('region-a');
    });

    expect(getRegionItem('region-a').style).toEqual({
      left: '0px',
      width: '100px',
      position: 'absolute',
    });
    expect(getRegionItem('region-a').previewContentStyle).toBeUndefined();
    expect(getRegionItem('region-b').style).toEqual({
      left: '200px',
      width: '200px',
      position: 'absolute',
    });
    expect(getRegionItem('region-b').previewContentStyle).toBeUndefined();
    expect(onRegionDragEnd).toHaveBeenCalledWith('region-a', 2, 0);
  });
});
