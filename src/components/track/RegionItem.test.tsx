import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import RegionItem from './RegionItem';
import { KGMidiRegion } from '../../core/region/KGMidiRegion';
import { KGMidiNote } from '../../core/midi/KGMidiNote';
import { KGAudioRegion } from '../../core/region/KGAudioRegion';
import { KGCore } from '../../core/KGCore';
import { KGProject } from '../../core/KGProject';
import { quarterNotesToTicks } from '../../core/timing';
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

  it.each([
    { timelineWidth: 320, resizeOffset: 0 },
    { timelineWidth: 320.5, resizeOffset: 0 },
    { timelineWidth: 320.5, resizeOffset: -40 },
  ])('aligns MIDI notes to the timeline with borders ($timelineWidth px, offset $resizeOffset)', ({ timelineWidth, resizeOffset }) => {
    const contentWidth = timelineWidth - 4;
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 2 + resizeOffset, y: 0, left: 2 + resizeOffset, top: 0,
      right: 2 + resizeOffset + contentWidth, bottom: 60,
      width: contentWidth, height: 60, toJSON: () => ({}),
    });
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const midiRegion = new KGMidiRegion('midi-1', 'track-1', 0, 'Test Region', 0, 15360);
    midiRegion.setNotes([new KGMidiNote('bar-4', 11520, 13440, 60)]);

    try {
      const { container } = renderRegion({
        midiRegion,
        style: { width: `${timelineWidth + resizeOffset}px`, border: '2px solid white' },
        previewContentStyle: resizeOffset ? { left: `${resizeOffset}px`, width: `${contentWidth}px` } : undefined,
      });
      const context = getContextSpy.mock.results.at(-1)?.value as { fillRect: ReturnType<typeof vi.fn> };
      const [noteX, , noteWidth] = context.fillRect.mock.calls[0];
      const canvas = container.querySelector('canvas')!;

      // Convert backing pixels to screen coordinates, including the border and
      // resize clipping offset. Bar 4 must remain at 3/4 of the timeline width.
      expect(2 + resizeOffset + noteX * contentWidth / canvas.width)
        .toBeCloseTo(resizeOffset + timelineWidth * 0.75, 8);
      expect(noteWidth * contentWidth / canvas.width).toBeCloseTo(timelineWidth / 8, 8);
      expect(canvas.style.width).toBe(`${contentWidth}px`);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('keeps waveform peaks at the same timeline pixels before and after an uneven split', () => {
    const project = new KGProject('Waveform alignment', 16, 0, 120);
    const coreSpy = vi.spyOn(KGCore, 'instance').mockReturnValue({ getCurrentProject: () => project } as KGCore);
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const sampleRate = 44100;
    const data = new Float32Array(sampleRate * 8);
    data[sampleRate * 2] = 1;
    data[sampleRate * 6] = 1;
    const audioBuffer = { sampleRate, getChannelData: () => data } as unknown as AudioBuffer;

    const draw = (id: string, startQuarter: number, lengthQuarter: number, clipOffset: number, timelineWidth: number, timelineLeft: number) => {
      const contentWidth = timelineWidth - 4;
      rectSpy.mockReturnValue({
        x: timelineLeft + 2, y: 0, left: timelineLeft + 2, top: 0,
        right: timelineLeft + 2 + contentWidth, bottom: 60,
        width: contentWidth, height: 60, toJSON: () => ({}),
      });
      const audioRegion = new KGAudioRegion(
        id, 'track-1', 0, 'Audio', quarterNotesToTicks(startQuarter),
        quarterNotesToTicks(lengthQuarter), 'file', 'audio.wav', 8, clipOffset
      );
      const { unmount } = renderRegion({
        id, midiRegion: undefined, audioRegion, audioBuffer,
        style: { left: `${timelineLeft}px`, width: `${timelineWidth}px`, border: '2px solid white' },
      });
      const context = getContextSpy.mock.results.at(-1)?.value as { fillRect: ReturnType<typeof vi.fn> };
      const peakPositions = context.fillRect.mock.calls
        .filter(([, y]) => y === 0)
        .map(([x]) => timelineLeft + 2 + x);
      unmount();
      return peakPositions;
    };

    try {
      const originalPeaks = draw('original', 0, 16, 0, 320, 0);
      const leftPeaks = draw('left', 0, 7, 0, 140, 0);
      const rightPeaks = draw('right', 7, 9, 3.5, 180, 140);
      expect(originalPeaks).toEqual([80, 240]);
      expect([...leftPeaks, ...rightPeaks]).toEqual(originalPeaks);
    } finally {
      coreSpy.mockRestore();
      rectSpy.mockRestore();
    }
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

  it('shows the waveform button for audio regions and triggers the waveform open callback', () => {
    const onOpenWaveform = vi.fn();
    const audioRegion = new KGAudioRegion('audio-1', 'track-2', 1, 'Audio Region', 0, 4);

    render(
      <RegionItem
        id="audio-1"
        name="Audio Region"
        style={{ left: '0px', width: '120px', position: 'absolute' }}
        onClick={vi.fn()}
        onOpenWaveform={onOpenWaveform}
        audioRegion={audioRegion}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View waveform' }));

    expect(onOpenWaveform).toHaveBeenCalledWith('audio-1');
  });
});
