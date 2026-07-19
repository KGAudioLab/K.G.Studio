import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventListPlayhead from './EventListPlayhead';

const rect = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  bottom: top + height,
  left: 0,
  right: 200,
  width: 200,
  height,
  toJSON: () => ({}),
});

const PlayheadTable = ({ playheadPosition }: { playheadPosition: number }) => (
  <div className="event-list-table-shell">
    <EventListPlayhead
      rows={[{ id: 'first', beat: 4 }, { id: 'second', beat: 12 }]}
      playheadPosition={playheadPosition}
      songEndBeat={16}
    />
    <table className="event-list-table">
      <thead><tr><th>Position</th></tr></thead>
      <tbody>
        <tr><td>2 1 0</td></tr>
        <tr><td>4 1 0</td></tr>
      </tbody>
    </table>
  </div>
);

describe('EventListPlayhead', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates without changing the table scroll position', () => {
    // The explicit TypeScript `this` parameter describes the DOM getter receiver.
    // eslint-disable-next-line no-unused-vars
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('event-list-table-shell') ? 100 : 0;
    });
    // eslint-disable-next-line no-unused-vars
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('event-list-table-shell')) return rect(0, 100);
      if (this.classList.contains('event-list-table')) return rect(0, 60);
      if (this.tagName === 'THEAD') return rect(0, 20);
      if (this.tagName === 'TR' && this.parentElement?.tagName === 'TBODY') {
        return rect((this as HTMLTableRowElement).rowIndex === 1 ? 20 : 40, 10);
      }
      return rect(0, 0);
    });

    const { container, rerender } = render(<PlayheadTable playheadPosition={4} />);
    const shell = container.querySelector<HTMLElement>('.event-list-table-shell');
    expect(screen.getByTestId('event-list-playhead')).toHaveStyle({ top: '20px' });

    if (!shell) throw new Error('Expected the event list table shell to render.');
    shell.scrollTop = 7;
    rerender(<PlayheadTable playheadPosition={8} />);

    expect(screen.getByTestId('event-list-playhead')).toHaveStyle({ top: '30px' });
    expect(shell.scrollTop).toBe(7);
  });
});
