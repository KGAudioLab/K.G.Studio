import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalChordLane from './GlobalChordLane';
import { KGChordRegion } from '../../core/region/KGChordRegion';

describe('GlobalChordLane', () => {
  const baseRegion = new KGChordRegion('chord-1', 'global-chord', 3, 'Cmaj7', 0, 4);

  beforeEach(() => {
    document.documentElement.style.setProperty('--track-grid-bar-width', '40');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => null),
    });
  });

  it('opens the chord popup for an existing region', () => {
    const onOpenPopup = vi.fn();

    render(
      <GlobalChordLane
        chordRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBeat={vi.fn()}
        onMoveRegion={vi.fn()}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={onOpenPopup}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={vi.fn()}
      />
    );

    fireEvent.doubleClick(screen.getByText('Cmaj7'));
    expect(onOpenPopup).toHaveBeenCalledWith('chord-1');
  });

  it('creates a new region at a bar-aligned beat on empty-lane double click and modifier click', () => {
    const onCreateAtBeat = vi.fn();

    const { container } = render(
      <GlobalChordLane
        chordRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBeat={onCreateAtBeat}
        onMoveRegion={vi.fn()}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={vi.fn()}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={vi.fn()}
      />
    );

    const lane = container.querySelector('.global-chord-lane') as HTMLDivElement;
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 24,
      width: 320,
      height: 24,
      toJSON: () => ({}),
    });

    fireEvent.doubleClick(lane, { clientX: 159, clientY: 10 });
    fireEvent.mouseDown(lane, { clientX: 81, clientY: 10, ctrlKey: true, button: 0 });

    expect(onCreateAtBeat).toHaveBeenNthCalledWith(1, 16);
    expect(onCreateAtBeat).toHaveBeenNthCalledWith(2, 8);
  });

  it('snaps drag moves to whole beats', async () => {
    const onMoveRegion = vi.fn();

    render(
      <GlobalChordLane
        chordRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBeat={vi.fn()}
        onMoveRegion={onMoveRegion}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={vi.fn()}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={vi.fn()}
      />
    );

    const region = screen.getByText('Cmaj7').closest('.global-chord-region') as HTMLDivElement;
    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 30,
      bottom: 24,
      width: 30,
      height: 24,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(region, { clientX: 15, clientY: 10, button: 0 });
    fireEvent.mouseMove(window, { clientX: 32, clientY: 10 });
    await waitFor(() => expect(region.style.left).toBe('20px'));
    fireEvent.mouseUp(window, { clientX: 32, clientY: 10 });

    expect(onMoveRegion).toHaveBeenCalledWith('chord-1', 2);
  });

  it('passes modifier state through region selection clicks', () => {
    const onSelectRegion = vi.fn();

    render(
      <GlobalChordLane
        chordRegions={[baseRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={[]}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={onSelectRegion}
        onCreateAtBeat={vi.fn()}
        onMoveRegion={vi.fn()}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={vi.fn()}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Cmaj7'), { metaKey: true, shiftKey: true });

    expect(onSelectRegion).toHaveBeenCalledWith('chord-1', { shiftKey: true, metaKey: true, ctrlKey: false });
  });

  it('drops the dragged selected chord onto a track row for import', () => {
    const secondRegion = new KGChordRegion('chord-2', 'global-chord', 3, 'F', 4, 4);
    const onDropChordRegionsToTrack = vi.fn();
    const trackGrid = document.createElement('div');
    trackGrid.className = 'track-grid';
    trackGrid.dataset.trackIndex = '2';
    document.body.appendChild(trackGrid);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(trackGrid);

    render(
      <GlobalChordLane
        chordRegions={[baseRegion, secondRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={['chord-1', 'chord-2']}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBeat={vi.fn()}
        onMoveRegion={vi.fn()}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={vi.fn()}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={onDropChordRegionsToTrack}
      />
    );

    const region = screen.getByText('Cmaj7').closest('.global-chord-region') as HTMLDivElement;
    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 30,
      bottom: 24,
      width: 30,
      height: 24,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(region, { clientX: 15, clientY: 10, button: 0 });
    fireEvent.mouseMove(window, { clientX: 15, clientY: 48 });
    fireEvent.mouseUp(window, { clientX: 15, clientY: 48 });

    expect(onDropChordRegionsToTrack).toHaveBeenCalledWith('chord-1', 2);
    document.body.removeChild(trackGrid);
  });

  it('still moves the chord horizontally when the drag ends back on the lane', () => {
    const secondRegion = new KGChordRegion('chord-2', 'global-chord', 3, 'F', 4, 4);
    const onMoveRegion = vi.fn();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);

    render(
      <GlobalChordLane
        chordRegions={[baseRegion, secondRegion]}
        maxBars={8}
        barWidthMultiplier={1}
        timeSignature={{ numerator: 4, denominator: 4 }}
        selectedRegionIds={['chord-2']}
        popupRegionId={null}
        onClosePopup={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtBeat={vi.fn()}
        onMoveRegion={onMoveRegion}
        onResizeRegion={vi.fn()}
        onChangeChord={vi.fn()}
        onOpenPopup={vi.fn()}
        onTabNavigate={vi.fn()}
        onDropChordRegionsToTrack={vi.fn()}
      />
    );

    const region = screen.getByText('Cmaj7').closest('.global-chord-region') as HTMLDivElement;
    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 30,
      bottom: 24,
      width: 30,
      height: 24,
      toJSON: () => ({}),
    });
    fireEvent.mouseDown(region, { clientX: 15, clientY: 10, button: 0 });
    fireEvent.mouseMove(window, { clientX: 32, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 32, clientY: 10 });

    expect(onMoveRegion).toHaveBeenCalledWith('chord-1', 2);
  });
});
