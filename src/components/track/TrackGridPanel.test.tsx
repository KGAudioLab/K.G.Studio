import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import TrackGridPanel from './TrackGridPanel';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: (selector?: (state: {
    selectedRegionIds: string[],
    refreshProjectState: () => void,
    timeSignature: { numerator: number; denominator: number },
    bpm: number,
  }) => unknown) => {
    const state = {
      selectedRegionIds: [],
      refreshProjectState: vi.fn(),
      timeSignature: { numerator: 4, denominator: 4 },
      bpm: 120,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock('../common', () => ({
  Playhead: () => null,
  FileImportModal: () => null,
}));

describe('TrackGridPanel lasso selection', () => {
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

  const renderPanel = () => {
    const regionA = createMockMidiRegion({ id: 'region-a', trackId: '1', trackIndex: 0, startFromBeat: 0, length: 4 });
    const regionB = createMockMidiRegion({ id: 'region-b', trackId: '2', trackIndex: 1, startFromBeat: 8, length: 4 });
    const trackA = createMockMidiTrack({ id: 1, regions: [regionA] });
    const trackB = createMockMidiTrack({ id: 2, regions: [regionB] });
    trackA.setTrackIndex(0);
    trackB.setTrackIndex(1);

    const onRegionLassoSelection = vi.fn();

    const view = render(
      <TrackGridPanel
        tracks={[trackA, trackB]}
        regions={[
          { id: 'region-a', trackId: '1', trackIndex: 0, barNumber: 1, length: 1, name: 'Region A' },
          { id: 'region-b', trackId: '2', trackIndex: 1, barNumber: 3, length: 1, name: 'Region B' },
        ]}
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
        draggedTrackIndex={null}
        dragOverTrackIndex={null}
        selectedRegionId={null}
        projectName="Test"
        onRegionCreated={vi.fn()}
        onRegionLassoSelection={onRegionLassoSelection}
      />
    );

    const gridContainer = view.container.querySelector('.grid-container') as HTMLDivElement;
    Object.defineProperty(gridContainer, 'clientWidth', { configurable: true, value: 320 });
    vi.spyOn(gridContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => ({}),
    });

    return { ...view, onRegionLassoSelection };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('selects intersecting regions across multiple track rows', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 130, clientY: 200 });
    fireEvent.mouseUp(document, { clientX: 130, clientY: 200 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false });
  });

  it('moves the release-point region to the end of the lasso selection order', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 130, clientY: 200, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-b', 'region-a'], { shiftKey: false });
  });

  it('uses the closest intersected region as primary when release is outside all regions', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 170 });
    fireEvent.mouseUp(document, { clientX: 150, clientY: 170 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false });
  });

  it('clears selection on a plain empty-space click', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 11, clientY: 11 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith([], { shiftKey: false });
  });
});
