import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import TrackGridPanel from './TrackGridPanel';
import { createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

const executeCommandMock = vi.fn();
const getCreatedRegionMock = vi.fn();

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

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      executeCommand: executeCommandMock,
    }),
  },
}));

vi.mock('../../util/miscUtil', () => ({
  generateNewRegionName: () => 'New Region',
}));

vi.mock('../../core/commands', async () => {
  const actual = await vi.importActual<typeof import('../../core/commands')>('../../core/commands');
  return {
    ...actual,
    CreateRegionCommand: {
      fromBarCoordinates: vi.fn((trackId: string, trackIndex: number, barNumber: number) => ({
        getCreatedRegion: () => getCreatedRegionMock() ?? createMockMidiRegion({
          id: 'created-region',
          trackId,
          trackIndex,
          startFromBeat: (barNumber - 1) * 4,
          length: 4,
        }),
      })),
    },
  };
});

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
    const onRegionCreated = vi.fn();

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
        onRegionCreated={onRegionCreated}
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

    return { ...view, onRegionLassoSelection, onRegionCreated };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    executeCommandMock.mockReset();
    getCreatedRegionMock.mockReset();
  });

  it('selects intersecting regions across multiple track rows', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 130, clientY: 200 });
    fireEvent.mouseUp(document, { clientX: 130, clientY: 200 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('moves the release-point region to the end of the lasso selection order', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 130, clientY: 200, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-b', 'region-a'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('uses the closest intersected region as primary when release is outside all regions', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(document, { clientX: 150, clientY: 170 });
    fireEvent.mouseUp(document, { clientX: 150, clientY: 170 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith(['region-a', 'region-b'], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('clears selection on a plain empty-space click', () => {
    const { container, onRegionLassoSelection } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;

    fireEvent.mouseDown(firstTrackGrid, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 11, clientY: 11 });

    expect(onRegionLassoSelection).toHaveBeenCalledWith([], { shiftKey: false, metaKey: false, ctrlKey: false });
  });

  it('does not create a region when ctrl-clicking an existing region', () => {
    const { container, onRegionCreated } = renderPanel();
    const region = container.querySelector('[data-region-id="region-a"]') as HTMLDivElement;

    fireEvent.mouseDown(region, { clientX: 20, clientY: 20, button: 0, ctrlKey: true });
    fireEvent.mouseUp(document, { clientX: 20, clientY: 20, ctrlKey: true });
    fireEvent.click(region, { ctrlKey: true });

    expect(onRegionCreated).not.toHaveBeenCalled();
  });

  it('creates a region when ctrl-clicking empty track space', async () => {
    const { container, onRegionCreated } = renderPanel();
    const firstTrackGrid = container.querySelector('[data-test-id="track-grid-1"]') as HTMLDivElement;
    getCreatedRegionMock.mockReturnValue(createMockMidiRegion({
      id: 'created-region',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 12,
      length: 4,
      name: 'New Region',
    }));

    fireEvent.click(firstTrackGrid, { clientX: 140, clientY: 20, ctrlKey: true });

    await vi.waitFor(() => {
      expect(onRegionCreated).toHaveBeenCalledTimes(1);
    });
  });
});
