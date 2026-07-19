import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildEventListPlayheadAnchors,
  interpolateEventListPlayheadY,
  type EventListPlayheadAnchor,
} from './eventListPlayheadUtil';

export interface EventListPlayheadRow {
  id: string;
  beat: number;
}

interface EventListPlayheadProps {
  rows: EventListPlayheadRow[];
  playheadPosition: number;
  songEndBeat: number;
}

const EventListPlayhead: React.FC<EventListPlayheadProps> = ({
  rows,
  playheadPosition,
  songEndBeat,
}) => {
  const [anchors, setAnchors] = useState<EventListPlayheadAnchor[]>([]);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rowLayoutKey = useMemo(
    () => rows.map(row => `${row.id}:${row.beat}`).join('|'),
    [rows],
  );

  useLayoutEffect(() => {
    const shell = markerRef.current?.parentElement;
    if (!shell || rows.length === 0) {
      setAnchors([]);
      return undefined;
    }

    const table = shell.querySelector<HTMLTableElement>('.event-list-table');
    const header = table?.tHead;
    const renderedRows = table?.tBodies[0]?.rows;
    if (!table || !header || !renderedRows || renderedRows.length !== rows.length) {
      setAnchors([]);
      return undefined;
    }

    const measure = () => {
      const shellRect = shell.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const shellContentTop = shellRect.top + shell.clientTop;
      const tableTop = tableRect.top - shellContentTop + shell.scrollTop;
      const bodyTop = tableTop + header.getBoundingClientRect().height;
      const measurements = rowsRef.current.map((row, index) => {
        const rect = renderedRows[index].getBoundingClientRect();
        return {
          beat: row.beat,
          top: rect.top - shellContentTop + shell.scrollTop,
          bottom: rect.bottom - shellContentTop + shell.scrollTop,
        };
      });

      setAnchors(buildEventListPlayheadAnchors(measurements, songEndBeat, bodyTop));
    };

    measure();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure);
    resizeObserver?.observe(shell);
    resizeObserver?.observe(table);
    window.addEventListener('resize', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [rowLayoutKey, rows.length, songEndBeat]);

  const y = interpolateEventListPlayheadY(playheadPosition, anchors);
  return (
    <>
      <span ref={markerRef} className="event-list-playhead-anchor" aria-hidden="true" />
      {y !== null && (
        <div
          className="event-list-playhead"
          data-testid="event-list-playhead"
          aria-hidden="true"
          style={{ top: `${y}px` }}
        />
      )}
    </>
  );
};

export default EventListPlayhead;
