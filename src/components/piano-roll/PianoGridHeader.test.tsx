import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PianoGridHeader from './PianoGridHeader';

const setPlayheadPosition = vi.fn();
const requestMainContentScroll = vi.fn();
const getPlayheadPosition = vi.fn(() => 0);

const storeState = {
  setPlayheadPosition,
  requestMainContentScroll,
};

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: () => storeState,
}));

vi.mock('../../core/KGCore', () => ({
  KGCore: {
    instance: () => ({
      getPlayheadPosition,
    }),
  },
}));

function renderHeader({
  hasPianoKeys = true,
  scrollLeft = 0,
  paddingLeft = hasPianoKeys ? '60px' : '0px',
}: {
  hasPianoKeys?: boolean;
  scrollLeft?: number;
  paddingLeft?: string;
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

  header.style.paddingLeft = paddingLeft;

  Object.defineProperty(header, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 100,
      top: 0,
      right: 600,
      bottom: 20,
      width: 500,
      height: 20,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    }),
  });

  return { ...view, header };
}

describe('PianoGridHeader', () => {
  beforeEach(() => {
    document.documentElement.style.setProperty('--region-grid-beat-width', '40px');
    setPlayheadPosition.mockClear();
    requestMainContentScroll.mockClear();
    getPlayheadPosition.mockClear();
    getPlayheadPosition.mockReturnValue(0);
  });

  it('seeks to the expected beat without horizontal scroll', () => {
    const { header } = renderHeader();

    fireEvent.click(header, { clientX: 280 });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(3);
    expect(requestMainContentScroll).toHaveBeenCalledTimes(1);
    expect(requestMainContentScroll).toHaveBeenCalledWith(3);
  });

  it('includes the note scroll offset when seeking after horizontal scroll', () => {
    const { header } = renderHeader({ scrollLeft: 160 });

    fireEvent.click(header, { clientX: 280 });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(7);
    expect(requestMainContentScroll).toHaveBeenCalledTimes(1);
    expect(requestMainContentScroll).toHaveBeenCalledWith(7);
  });

  it('does not subtract a gutter when piano keys are hidden', () => {
    const { header } = renderHeader({ hasPianoKeys: false });

    fireEvent.click(header, { clientX: 180 });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(2);
    expect(requestMainContentScroll).toHaveBeenCalledWith(2);
  });

  it('uses the same corrected math on mousedown for drag-to-seek', () => {
    const { header } = renderHeader({ scrollLeft: 80 });

    fireEvent.mouseDown(header, { button: 0, clientX: 280 });

    expect(setPlayheadPosition).toHaveBeenCalledTimes(1);
    expect(setPlayheadPosition).toHaveBeenCalledWith(5);
    expect(requestMainContentScroll).not.toHaveBeenCalled();
  });
});
