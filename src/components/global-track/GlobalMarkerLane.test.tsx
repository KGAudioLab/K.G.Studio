import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KGMarkerRegion } from '../../core/region/KGMarkerRegion';
import { KGMainContentState } from '../../core/state/KGMainContentState';
import { ticksPerMeterBeat } from '../../core/timing';
import GlobalMarkerLane from './GlobalMarkerLane';

describe('GlobalMarkerLane snapping', () => {
  it.each([
    { mode: 'off', startBeat: 3.8, resizedEndBeat: 10.8 },
    { mode: 'beat', startBeat: 4, resizedEndBeat: 10.5 },
    { mode: 'bar', startBeat: 6, resizedEndBeat: 12 },
  ] as const)('moves and resizes with snapping set to $mode', ({ mode, startBeat, resizedEndBeat }) => {
    const timeSignature = { numerator: 6, denominator: 8 };
    const beatTicks = ticksPerMeterBeat(timeSignature);
    const marker = new KGMarkerRegion('marker-1', 'global-marker', 0, 'Intro', 1.5 * beatTicks, 6 * beatTicks);
    const onMoveRegion = vi.fn();
    const onResizeRegion = vi.fn();
    const snapping = KGMainContentState.instance();
    snapping.setSnapping(mode !== 'off');
    snapping.setSnappingMode(mode === 'beat' ? 'beat' : 'bar');

    render(
      <GlobalMarkerLane
        markerRegions={[marker]}
        maxBars={8}
        barWidthMultiplier={1.5}
        timeSignature={timeSignature}
        selectedRegionIds={[]}
        editingRegionId={null}
        editingText=""
        onEditingTextChange={vi.fn()}
        onCommitEdit={vi.fn()}
        onCancelEdit={vi.fn()}
        onBeginEdit={vi.fn()}
        onSelectRegion={vi.fn()}
        onCreateAtTick={vi.fn()}
        onMoveRegion={onMoveRegion}
        onResizeRegion={onResizeRegion}
      />
    );

    // At this zoom each eighth-note beat is 10px, so the region spans 15px to 75px.
    const region = screen.getByText('Intro').parentElement!;
    vi.spyOn(region, 'getBoundingClientRect').mockReturnValue(new DOMRect(15, 0, 60, 24));

    fireEvent.mouseDown(region, { clientX: 45, button: 0 });
    fireEvent.mouseMove(window, { clientX: 68 });
    expect(parseFloat(region.style.left)).toBeCloseTo(startBeat * 10);
    fireEvent.mouseUp(window, { clientX: 68 });
    expect(onMoveRegion).toHaveBeenCalledExactlyOnceWith(marker.getId(), Math.round(startBeat * beatTicks));

    fireEvent.mouseDown(region, { clientX: 15, button: 0 });
    fireEvent.mouseMove(window, { clientX: 38 });
    expect(parseFloat(region.style.left)).toBeCloseTo(startBeat * 10);
    expect(parseFloat(region.style.width)).toBeCloseTo((7.5 - startBeat) * 10);
    fireEvent.mouseUp(window, { clientX: 38 });
    expect(onResizeRegion).toHaveBeenNthCalledWith(1, marker.getId(), 'start', Math.round(startBeat * beatTicks));

    fireEvent.mouseDown(region, { clientX: 75, button: 0 });
    fireEvent.mouseMove(window, { clientX: 108 });
    expect(parseFloat(region.style.width)).toBeCloseTo((resizedEndBeat - 1.5) * 10);
    fireEvent.mouseUp(window, { clientX: 108 });
    expect(onResizeRegion).toHaveBeenNthCalledWith(2, marker.getId(), 'end', Math.round(resizedEndBeat * beatTicks));
  });
});
