import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KGPianoRollState } from '../../core/state/KGPianoRollState';
import { createMockMidiControllerEvent, createMockMidiPitchBend, createMockMidiRegion, createMockMidiTrack } from '../../test/utils/mock-data';

const coreMock = {
  selectedItems: [] as Array<{ getId(): string }>,
  currentProjectTracks: [] as ReturnType<typeof createMockMidiTrack>[],
  getSelectedItems: vi.fn(() => coreMock.selectedItems),
  getCurrentProject: vi.fn(() => ({
    getTracks: () => coreMock.currentProjectTracks,
  })),
  clearSelectedItems: vi.fn(() => {
    coreMock.selectedItems = [];
  }),
  addSelectedItems: vi.fn((items: Array<{ getId(): string }>) => {
    coreMock.selectedItems = items;
  }),
  executeCommand: vi.fn((command: { execute(): void }) => {
    command.execute();
  }),
};

const storeState = {
  tracks: [] as ReturnType<typeof createMockMidiTrack>[],
  updateTrack: vi.fn().mockResolvedValue(undefined),
  refreshProjectState: vi.fn(),
  bumpAutomationRedrawVersion: vi.fn(),
  selectedPitchBendIds: [] as string[],
  selectedControllerEventIds: [] as string[],
};

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => coreMock,
  },
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

import PianoRollAutomationLane from './PianoRollAutomationLane';
import { getControllerNumberForAutomationType } from './pianoRollAutomation';

describe('PianoRollAutomationLane', () => {
  beforeEach(() => {
    coreMock.selectedItems = [];
    coreMock.currentProjectTracks = [];
    coreMock.getSelectedItems.mockClear();
    coreMock.getCurrentProject.mockClear();
    coreMock.clearSelectedItems.mockClear();
    coreMock.addSelectedItems.mockClear();
    coreMock.executeCommand.mockClear();
    storeState.updateTrack.mockClear();
    storeState.refreshProjectState.mockClear();
    storeState.bumpAutomationRedrawVersion.mockClear();
    storeState.selectedPitchBendIds = [];
    storeState.selectedControllerEventIds = [];
    KGPianoRollState.instance().setActiveTool('pointer');
    KGPianoRollState.instance().setCurrentSnap('1/4');
  });

  it('renders pitch bend points with signed labels and selected styling', () => {
    const region = createMockMidiRegion({
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 4,
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0.5, value: 8192 }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 1.5, value: 12288 }),
      ],
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;
    storeState.selectedPitchBendIds = ['bend-1'];

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(screen.getByLabelText('Pitch Bend automation lane')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('4096')).toBeInTheDocument();
    expect(container.querySelector('.piano-roll-automation-line')).not.toBeNull();

    const selectedPoint = container.querySelector('.piano-roll-automation-point.selected');
    expect(selectedPoint).not.toBeNull();
    expect(selectedPoint).toHaveAttribute('fill', '#FFFFFF');
  });

  it('creates a snapped pitch bend on double click and selects it', async () => {
    const region = createMockMidiRegion({
      id: 'region-1',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 4,
      pitchBends: [],
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    const lane = screen.getByLabelText('Pitch Bend automation lane');
    Object.defineProperty(lane, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 200, width: 1000, height: 200 }),
    });

    fireEvent.doubleClick(container.querySelector('.piano-roll-automation-scroll-layer')!, {
      clientX: 170,
      clientY: 50,
    });

    await waitFor(() => {
      expect(coreMock.executeCommand).toHaveBeenCalledTimes(1);
      expect(region.getPitchBends()).toHaveLength(1);
      expect(region.getPitchBends()[0].getBeat()).toBe(-1);
      expect(coreMock.addSelectedItems).toHaveBeenCalled();
      expect(storeState.bumpAutomationRedrawVersion).toHaveBeenCalled();
    });
  });

  it('creates an unsnapped pitch bend at the raw horizontal beat when snapping is off', async () => {
    const region = createMockMidiRegion({
      id: 'region-raw',
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 4,
      pitchBends: [],
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;
    KGPianoRollState.instance().setCurrentSnap('NO SNAP');

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    const lane = screen.getByLabelText('Pitch Bend automation lane');
    Object.defineProperty(lane, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 1000, bottom: 200, width: 1000, height: 200 }),
    });

    fireEvent.doubleClick(container.querySelector('.piano-roll-automation-scroll-layer')!, {
      clientX: 150,
      clientY: 50,
    });

    await waitFor(() => {
      expect(region.getPitchBends()).toHaveLength(1);
      expect(region.getPitchBends()[0].getBeat()).toBeCloseTo(-1.75);
    });
  });

  it('shift-click adds controller events to the selection', async () => {
    const controller = getControllerNumberForAutomationType('cc-7')!;
    const controllerEventsByType = Array.from({ length: 128 }, () => [] as ReturnType<typeof createMockMidiControllerEvent>[]);
    controllerEventsByType[controller] = [
      createMockMidiControllerEvent({ id: 'cc7-1', beat: 0.25, value: 57 }),
      createMockMidiControllerEvent({ id: 'cc7-2', beat: 2, value: 82 }),
    ];
    const region = createMockMidiRegion({
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 0,
      controllerEventsByType,
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;
    storeState.selectedControllerEventIds = ['cc7-1'];

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="cc-7"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    const points = container.querySelectorAll('.piano-roll-automation-point');
    fireEvent.mouseDown(points[1], { shiftKey: true, clientX: 0, clientY: 0 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      expect(coreMock.addSelectedItems).toHaveBeenCalled();
      const selectedItems = coreMock.addSelectedItems.mock.calls.at(-1)?.[0] ?? [];
      expect(selectedItems).toHaveLength(2);
    });
  });

  it('renders step-style hold segments for non-interpolatable automation', () => {
    const controllerEventsByType = Array.from({ length: 128 }, () => [] as ReturnType<typeof createMockMidiControllerEvent>[]);
    controllerEventsByType[64] = [
      createMockMidiControllerEvent({ id: 'cc64-1', beat: 0.5, value: 127 }),
      createMockMidiControllerEvent({ id: 'cc64-2', beat: 2, value: 0 }),
    ];

    const region = createMockMidiRegion({
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 0,
      controllerEventsByType,
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="cc-64"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    expect(container.querySelector('.piano-roll-automation-line')).not.toBeNull();
    expect(container.querySelector('polyline.piano-roll-automation-line')).toBeNull();
    expect(container.querySelectorAll('line.piano-roll-automation-line')).toHaveLength(2);
  });

  it('redraws connection lines using sorted preview positions when a point crosses another point', async () => {
    const region = createMockMidiRegion({
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 0,
      pitchBends: [
        createMockMidiPitchBend({ id: 'bend-1', beat: 0, value: 8192 }),
        createMockMidiPitchBend({ id: 'bend-2', beat: 2, value: 12288 }),
        createMockMidiPitchBend({ id: 'bend-3', beat: 4, value: 4096 }),
      ],
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;
    storeState.selectedPitchBendIds = ['bend-2'];

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    const points = container.querySelectorAll('.piano-roll-automation-point');
    fireEvent.mouseDown(points[1], { clientX: 140, clientY: 70 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 70 });

    const polyline = container.querySelector('polyline.piano-roll-automation-line');
    expect(polyline).not.toBeNull();

    const pointsAttr = polyline?.getAttribute('points') ?? '';
    const xValues = pointsAttr.split(' ').map(point => parseFloat(point.split(',')[0]));

    expect(xValues[0]).toBeLessThanOrEqual(xValues[1]);
    expect(xValues[1]).toBeLessThanOrEqual(xValues[2]);
  });

  it('shows the create cursor when the modifier key is held', async () => {
    const region = createMockMidiRegion({
      trackId: '1',
      trackIndex: 0,
      startFromBeat: 0,
      pitchBends: [],
    });
    storeState.tracks = [createMockMidiTrack({ id: 1, regions: [region] })];
    coreMock.currentProjectTracks = storeState.tracks;

    const { container } = render(
      <PianoRollAutomationLane
        activeRegion={region}
        automationType="pitch-bend"
        maxBars={8}
        timeSignature={{ numerator: 4, denominator: 4 }}
      />
    );

    const getScrollLayer = () => container.querySelector('.piano-roll-automation-scroll-layer');
    expect(getScrollLayer()?.classList.contains('pencil-cursor')).toBe(false);

    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    await waitFor(() => {
      expect(getScrollLayer()?.classList.contains('pencil-cursor')).toBe(true);
    });

    fireEvent.keyUp(window, { key: 'Control', ctrlKey: false });
    await waitFor(() => {
      expect(getScrollLayer()?.classList.contains('pencil-cursor')).toBe(false);
    });
  });
});
