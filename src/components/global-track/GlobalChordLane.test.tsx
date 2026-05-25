import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalChordLane from './GlobalChordLane';
import { KGChordRegion } from '../../core/region/KGChordRegion';

describe('GlobalChordLane', () => {
  const baseRegion = new KGChordRegion('chord-1', 'global-chord', 3, 'Cmaj7', 0, 4);

  beforeEach(() => {
    document.documentElement.style.setProperty('--track-grid-bar-width', '40');
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
});
