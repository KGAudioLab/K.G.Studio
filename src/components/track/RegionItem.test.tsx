import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import RegionItem from './RegionItem';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMainContentState } from '../../core/state/KGMainContentState';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => ({
    selectedRegionIds: [],
    timeSignature: { numerator: 4, denominator: 4 },
    bpm: 120,
  }),
}));

describe('RegionItem', () => {
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
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
    KGMainContentState.instance().setActiveTool('pointer');
  });

  const renderRegion = (props: Partial<React.ComponentProps<typeof RegionItem>> = {}) => {
    const midiRegion = new KGMidiRegion('midi-1', 'track-1', 0, 'Test Region', 0, 4);

    return render(
      <RegionItem
        id="midi-1"
        name="Test Region"
        style={{ left: '0px', width: '120px', position: 'absolute' }}
        onClick={vi.fn()}
        onDragStart={vi.fn()}
        onDrag={vi.fn()}
        onDragEnd={vi.fn()}
        midiRegion={midiRegion}
        {...props}
      />
    );
  };

  it('treats small pointer jitter as a click', () => {
    const onClick = vi.fn();
    const onDragStart = vi.fn();
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();

    const { container } = renderRegion({ onClick, onDragStart, onDrag, onDragEnd });
    const region = container.querySelector('.track-region');

    expect(region).toBeTruthy();

    fireEvent.mouseDown(region!, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 102, clientY: 102 });
    fireEvent.mouseUp(document, { clientX: 102, clientY: 102 });

    expect(onClick).toHaveBeenCalledWith('midi-1');
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDrag).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('starts a drag after crossing the movement threshold', () => {
    const onClick = vi.fn();
    const onDragStart = vi.fn();
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();

    const { container } = renderRegion({ onClick, onDragStart, onDrag, onDragEnd });
    const region = container.querySelector('.track-region');

    expect(region).toBeTruthy();

    fireEvent.mouseDown(region!, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 110, clientY: 100 });
    fireEvent.mouseUp(document, { clientX: 110, clientY: 100 });

    expect(onClick).not.toHaveBeenCalled();
    expect(onDragStart).toHaveBeenCalledWith('midi-1', 100, 100);
    expect(onDrag).toHaveBeenCalledWith('midi-1', 10, 0);
    expect(onDragEnd).toHaveBeenCalledWith('midi-1');
  });
});
