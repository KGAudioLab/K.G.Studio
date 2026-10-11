import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import EqCard, { type EqPreviewState } from './EqCard';
import { createPreviewBands } from './eqPreview';
import type { KGTrack } from '../../core/track/KGTrack';
import ReverbCard, { type ReverbPreviewState } from './ReverbCard';
import CompressorCard, { type CompressorPreviewState } from './CompressorCard';
import LimiterCard, { type LimiterPreviewState } from './LimiterCard';

const previews = new WeakMap<KGTrack, EqPreviewState>();
const reverbPreviews = new WeakMap<KGTrack, ReverbPreviewState>();
const compressorPreviews = new WeakMap<KGTrack, CompressorPreviewState>();
const limiterPreviews = new WeakMap<KGTrack, LimiterPreviewState>();
type FxType = 'eq' | 'reverb' | 'compressor' | 'limiter';
const defaultOrder: FxType[] = ['eq', 'reverb', 'compressor', 'limiter'];
const orders = new WeakMap<KGTrack, FxType[]>();

function createCompressorPreview(): CompressorPreviewState {
  return { enabled: true, expanded: true, threshold: -24, ratio: 4, attack: 10, release: 228, gain: 0 };
}

function createLimiterPreview(): LimiterPreviewState {
  return { enabled: true, expanded: true, gain: 0, ceiling: -4.1, attack: 5, release: 50 };
}

// Temporary UI state only; excluded from projects and the audio graph.
export default function TrackFxPanel({ track, hidden }: { track: KGTrack | null; hidden: boolean }) {
  const [, redraw] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const dragAllowed = useRef(false);
  const [dragging, setDragging] = useState<{ track: KGTrack; type: FxType } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: FxType; after: boolean } | null>(null);
  const state = track ? previews.get(track) ?? {
    enabled: true, expanded: true, selectedBand: 1, bands: createPreviewBands(),
  } : null;
  const compressorState = track ? compressorPreviews.get(track) ?? createCompressorPreview() : null;
  const limiterState = track ? limiterPreviews.get(track) ?? createLimiterPreview() : null;
  const reverbState = track ? reverbPreviews.get(track) ?? {
    enabled: true, expanded: true, type: 'hall' as const, mix: 0.1,
  } : null;
  const order = track ? orders.get(track) ?? defaultOrder : defaultOrder;
  const move = (source: FxType, target: FxType, after: boolean) => {
    if (!track || source === target) return;
    const next = order.filter(type => type !== source);
    next.splice(next.indexOf(target) + (after ? 1 : 0), 0, source);
    orders.set(track, next);
    redraw(revision => revision + 1);
  };
  const isAfter = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  };
  const finishDrag = () => { setDragging(null); setDropTarget(null); dragAllowed.current = false; };
  const cards = {
    eq: track && state && <EqCard state={state} onChange={next => {
      previews.set(track, next);
      redraw(revision => revision + 1);
    }} />,
    reverb: track && reverbState && <ReverbCard state={reverbState} onChange={next => {
      reverbPreviews.set(track, next);
      redraw(revision => revision + 1);
    }} />,
    compressor: track && compressorState && <CompressorCard state={compressorState} onChange={next => {
      compressorPreviews.set(track, next);
      redraw(revision => revision + 1);
    }} />,
    limiter: track && limiterState && <LimiterCard state={limiterState} onChange={next => {
      limiterPreviews.set(track, next);
      redraw(revision => revision + 1);
    }} />,
  };
  return (
    <div ref={panel} className="track-fx-panel" hidden={hidden}>
      {track && order.map(type => (
        <div key={type} className={`fx-sortable${dragging?.track === track && dragging.type === type ? ' is-dragging' : ''}${dragging?.track === track && dropTarget?.type === type ? ` drop-${dropTarget.after ? 'after' : 'before'}` : ''}`}
          onMouseDownCapture={event => {
            const target = event.target as HTMLElement;
            dragAllowed.current = !!target.closest('.fx-card-header') && !target.closest('button');
          }}
          onDragStart={event => {
            if (!dragAllowed.current) { event.preventDefault(); return; }
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', type);
            setDragging({ track, type });
          }}
          onDragOver={event => {
            if (dragging?.track !== track) return;
            event.preventDefault(); event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setDropTarget(dragging.type === type ? null : { type, after: isAfter(event) });
            if (panel.current) {
              const rect = panel.current.getBoundingClientRect();
              if (event.clientY > rect.bottom - 32) panel.current.scrollTop += 12;
              else if (event.clientY < rect.top + 32) panel.current.scrollTop -= 12;
            }
          }}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
          }}
          onDrop={event => {
            if (dragging?.track !== track) return;
            event.preventDefault(); event.stopPropagation();
            move(dragging.type, type, isAfter(event));
            finishDrag();
          }}
          onDragEnd={event => { event.stopPropagation(); finishDrag(); }}
          onKeyDownCapture={event => {
            if (!(event.target as HTMLElement).closest('.fx-card-title') || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const index = order.indexOf(type);
            const neighbor = order[index + (event.key === 'ArrowUp' ? -1 : 1)];
            if (neighbor) move(type, neighbor, event.key === 'ArrowDown');
          }}>
          {cards[type]}
        </div>
      ))}
    </div>
  );
}
