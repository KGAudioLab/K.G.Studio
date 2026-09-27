import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PianoGridHeader from './PianoGridHeader';
import { TICKS_PER_QUARTER } from '../../core/timing';

const q = (quarterNotes: number): number => quarterNotes * TICKS_PER_QUARTER;

const setPlayheadTick = vi.fn();
const seekPlayheadTick = vi.fn(async (position: number) => {
  setPlayheadTick(position);
  return true;
});
const setPlayheadSeekPreviewPosition = vi.fn(() => true);
const requestMainContentScroll = vi.fn();
const getPlayheadTick = vi.fn(() => 0);

const storeState = {
  setPlayheadTick,
  seekPlayheadTick,
  setPlayheadSeekPreviewPosition,
  requestMainContentScroll,
  playheadTick: q(2),
  playheadSeekPreviewPosition: null,
  isPlaying: false,
  isRecording: false,
  timeSignature: { numerator: 4, denominator: 4 },
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getPlayheadTick,
    }),
  },
}));

function renderHeader({
  hasPianoKeys = true,
  scrollLeft = 0,
  paddingLeft = hasPianoKeys ? '60px' : '0px',
  scrollContainerLeft = 100,
}: {
  hasPianoKeys?: boolean;
  scrollLeft?: number;
  paddingLeft?: string;
  scrollContainerLeft?: number;
} = {}) {
  const view = render(
    <div className="piano-roll-note-scroll">
      <PianoGridHeader maxBars={8} hasPianoKeys={hasPianoKeys} />
    </div>
  );

  const scrollContainer = view.container.querySelector('.piano-roll-note-scroll') as HTMLDivElement;
  const header = view.container.querySelector('.piano-grid-header') as HTMLDivElement;

  Object.defineProperty(scrollContainer, 'scrollLeft', {
    configurable: true,
    value: scrollLeft,
    writable: true,
  });

  Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: scrollContainerLeft,
      top: 0,
      right: scrollContainerLeft + 500,
      bottom: 20,
      width: 500,
      height: 20,
      x: scrollContainerLeft,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  header.style.paddingLeft = paddingLeft;

  Object.defineProperty(header, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: scrollContainerLeft - scrollLeft,
      top: 0,
      right: scrollContainerLeft - scrollLeft + 500,
      bottom: 20,
      width: 500,
      height: 20,
      x: scrollContainerLeft - scrollLeft,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  return { ...view, header };
}

describe('PianoGridHeader', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
    setPlayheadTick.mockClear();
    seekPlayheadTick.mockClear();
    setPlayheadSeekPreviewPosition.mockClear();
    requestMainContentScroll.mockClear();
    getPlayheadTick.mockClear();
    getPlayheadTick.mockReturnValue(0);
    storeState.isPlaying = false;
    storeState.isRecording = false;
  });

  it('seeks to the expected beat without horizontal scroll', async () => {
    const { header } = renderHeader();

    fireEvent.click(header, { clientX: 280 });

    expect(seekPlayheadTick).toHaveBeenCalledWith(q(3));
    await vi.waitFor(() => expect(requestMainContentScroll).toHaveBeenCalledWith(q(3)));
  });

  it('renders a playhead segment over the piano bar numbers', () => {
    const { header } = renderHeader();
    const playheadLayer = header.querySelector('.piano-grid-header-playhead');
    const playhead = playheadLayer?.querySelector('.playhead');

    expect(playheadLayer?.querySelectorAll('.playhead')).toHaveLength(1);
    expect(playheadLayer?.querySelectorAll('.playhead-triangle')).toHaveLength(1);
    expect(playhead).toHaveStyle({ left: '80px' });
  });

  it('removes the playhead gutter offset when piano keys are hidden', () => {
    const { header } = renderHeader({ hasPianoKeys: false });

    expect(header).toHaveClass('no-piano-keys');
    expect(header.querySelector('.piano-grid-header-playhead')).toBeInTheDocument();
  });

  it('seeks to the same beat after horizontal scroll when the header rect already shifts with content', async () => {
    const { header } = renderHeader({ scrollLeft: 160 });

    fireEvent.click(header, { clientX: 280 });

    expect(seekPlayheadTick).toHaveBeenCalledWith(q(7));
    await vi.waitFor(() => expect(requestMainContentScroll).toHaveBeenCalledWith(q(7)));
  });

  it('does not subtract a gutter when piano keys are hidden', async () => {
    const { header } = renderHeader({ hasPianoKeys: false });

    fireEvent.click(header, { clientX: 180 });

    expect(seekPlayheadTick).toHaveBeenCalledWith(q(2));
    await vi.waitFor(() => expect(requestMainContentScroll).toHaveBeenCalledWith(q(2)));
  });

  it('uses the same corrected math on mousedown for drag-to-seek', () => {
    const { header } = renderHeader({ scrollLeft: 80 });

    fireEvent.mouseDown(header, { button: 0, clientX: 280 });

    expect(setPlayheadTick).toHaveBeenCalledTimes(1);
    expect(setPlayheadTick).toHaveBeenCalledWith(q(5));
    expect(requestMainContentScroll).not.toHaveBeenCalled();
  });

  it('previews an active-playback drag and seeks only once on release', async () => {
    storeState.isPlaying = true;
    const { header } = renderHeader();

    fireEvent.mouseDown(header, { button: 0, clientX: 280 });
    fireEvent.mouseMove(document, { clientX: 320 });

    expect(setPlayheadSeekPreviewPosition).toHaveBeenNthCalledWith(1, q(3));
    expect(setPlayheadSeekPreviewPosition).toHaveBeenNthCalledWith(2, q(4));
    expect(seekPlayheadTick).not.toHaveBeenCalled();

    fireEvent.mouseUp(document, { clientX: 320, button: 0 });
    fireEvent.click(header, { clientX: 320 });

    expect(setPlayheadSeekPreviewPosition).toHaveBeenLastCalledWith(null);
    await vi.waitFor(() => expect(seekPlayheadTick).toHaveBeenCalledTimes(1));
    expect(seekPlayheadTick).toHaveBeenCalledWith(q(4));
  });

  it('ignores clicks inside the visible piano-key gutter before it fully scrolls out of view', () => {
    const { header } = renderHeader({ scrollLeft: 20 });

    fireEvent.click(header, { clientX: 110 });

    expect(setPlayheadTick).not.toHaveBeenCalled();
    expect(requestMainContentScroll).not.toHaveBeenCalled();
  });
});
