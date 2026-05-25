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

    expect(onClick).toHaveBeenCalledWith('midi-1', { shiftKey: false, metaKey: false, ctrlKey: false });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(onDrag).not.toHaveBeenCalled();
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('passes shift-click state through the region click callback', () => {
    const onClick = vi.fn();
    const { container } = renderRegion({ onClick });
    const region = container.querySelector('.track-region');

    expect(region).toBeTruthy();

    fireEvent.mouseDown(region!, { clientX: 100, clientY: 100, shiftKey: true });
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100, shiftKey: true });

    expect(onClick).toHaveBeenCalledWith('midi-1', { shiftKey: true, metaKey: false, ctrlKey: false });
  });

  it('passes cmd-click state through the region click callback', () => {
    const onClick = vi.fn();
    const { container } = renderRegion({ onClick });
    const region = container.querySelector('.track-region');

    expect(region).toBeTruthy();

    fireEvent.mouseDown(region!, { clientX: 100, clientY: 100, metaKey: true });
    fireEvent.mouseUp(document, { clientX: 100, clientY: 100, metaKey: true });

    expect(onClick).toHaveBeenCalledWith('midi-1', { shiftKey: false, metaKey: true, ctrlKey: false });
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

  it('renders preview waveform peaks on the canvas for recording previews', () => {
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 120,
      bottom: 60,
      width: 120,
      height: 60,
      toJSON: () => ({}),
    });
    const { container } = renderRegion({
      audioRegion: undefined,
      midiRegion: undefined,
      previewWaveformPeaks: [
        { min: -0.25, max: 0.5 },
        { min: -0.5, max: 0.25 },
      ],
      isPreview: true,
    });

    const context = getContextSpy.mock.results[0]?.value as {
      beginPath: ReturnType<typeof vi.fn>;
      lineTo: ReturnType<typeof vi.fn>;
      stroke: ReturnType<typeof vi.fn>;
    };

    expect(container.querySelector('[data-preview-region="true"]')).toBeTruthy();
    expect(context.beginPath).toHaveBeenCalled();
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    rectSpy.mockRestore();
  });

  it('applies preview content clipping styles when provided', () => {
    const { container } = renderRegion({
      previewContentStyle: {
        left: '-40px',
        width: '120px',
      },
    });

    const previewContent = container.querySelector('.region-preview-content');

    expect(previewContent).toBeTruthy();
    expect(previewContent).toHaveAttribute('data-preview-content-active', 'true');
    expect(previewContent).toHaveStyle({
      left: '-40px',
      width: '120px',
    });
  });

  it('uses the default preview content wrapper sizing for normal regions', () => {
    const { container } = renderRegion();

    const previewContent = container.querySelector('.region-preview-content');

    expect(previewContent).toBeTruthy();
    expect(previewContent).toHaveAttribute('data-preview-content-active', 'false');
    expect(previewContent).not.toHaveStyle({
      left: '-40px',
      width: '120px',
    });
  });
});
