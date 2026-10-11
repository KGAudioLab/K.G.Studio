import { useState } from 'react';
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

function createCompressorPreview(): CompressorPreviewState {
  return { enabled: true, expanded: true, threshold: -24, ratio: 4, attack: 10, release: 228, gain: 0 };
}

function createLimiterPreview(): LimiterPreviewState {
  return { enabled: true, expanded: true, gain: 0, ceiling: -4.1, attack: 5, release: 50 };
}

// Temporary UI state only; excluded from projects and the audio graph.
export default function TrackFxPanel({ track, hidden }: { track: KGTrack | null; hidden: boolean }) {
  const [, redraw] = useState(0);
  const state = track ? previews.get(track) ?? {
    enabled: true, expanded: true, selectedBand: 1, bands: createPreviewBands(),
  } : null;
  const compressorState = track ? compressorPreviews.get(track) ?? createCompressorPreview() : null;
  const limiterState = track ? limiterPreviews.get(track) ?? createLimiterPreview() : null;
  const reverbState = track ? reverbPreviews.get(track) ?? {
    enabled: true, expanded: true, type: 'hall' as const, mix: 0.1,
  } : null;
  return (
    <div className="track-fx-panel" hidden={hidden}>
      {track && state && <EqCard state={state} onChange={next => {
        previews.set(track, next);
        redraw(revision => revision + 1);
      }} />}
      {track && reverbState && <ReverbCard state={reverbState} onChange={next => {
        reverbPreviews.set(track, next);
        redraw(revision => revision + 1);
      }} />}
      {track && compressorState && <CompressorCard state={compressorState} onChange={next => {
        compressorPreviews.set(track, next);
        redraw(revision => revision + 1);
      }} />}
      {track && limiterState && <LimiterCard state={limiterState} onChange={next => {
        limiterPreviews.set(track, next);
        redraw(revision => revision + 1);
      }} />}
    </div>
  );
}
