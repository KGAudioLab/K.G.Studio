import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { KGTrack } from '../../core/track/KGTrack';
import { KGAudioInterface } from '../../core/audio-interface/KGAudioInterface';
import { useProjectStore } from '../../stores/projectStore';
import { useI18n } from '../../i18n/useI18n';

interface PanGesture {
  pointerId: number;
  x: number;
  y: number;
  start: number;
  value: number;
  target: HTMLButtonElement;
}

const clampPan = (value: number) => Math.max(-1, Math.min(1, value));

export default function TrackPanKnob({ track }: { track: KGTrack }) {
  const { t } = useI18n();
  const tracks = useProjectStore(state => state.tracks);
  const [pan, setPan] = useState(track.getPan());
  const gesture = useRef<PanGesture | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  const setAudioPan = (value: number) => {
    KGAudioInterface.instance().setTrackPan(track.getId().toString(), value);
  };

  useEffect(() => {
    if (!gesture.current && !pending.current) setPan(track.getPan());
  }, [track, tracks]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const active = gesture.current;
      gesture.current = null;
      if (active) {
        if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
        try {
          KGAudioInterface.instance().setTrackPan(track.getId().toString(), track.getPan());
        } catch (error) {
          console.error('Failed to restore base pan:', error);
        }
      }
    };
  }, [track]);

  const restore = () => {
    if (mounted.current) setPan(track.getPan());
    setAudioPan(track.getPan());
  };

  const commit = async (value: number) => {
    if (pending.current) return;
    if (value === track.getPan()) {
      restore();
      return;
    }
    pending.current = true;
    try {
      await useProjectStore.getState().updateTrackProperties(track.getId(), { pan: value });
    } catch (error) {
      console.error('Failed to persist base pan:', error);
    } finally {
      pending.current = false;
      if (mounted.current) restore();
    }
  };

  const finishGesture = (event: PointerEvent<HTMLButtonElement>, cancel: boolean) => {
    event.stopPropagation();
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    gesture.current = null;
    if (active.target.hasPointerCapture?.(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    if (cancel) restore();
    else void commit(active.value);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.button !== 0 || pending.current || gesture.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      start: track.getPan(), value: track.getPan(), target: event.currentTarget,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = active.y - event.clientY;
    active.value = clampPan(active.start + (Math.abs(dx) >= Math.abs(dy) ? dx : dy) / 100);
    setPan(active.value);
    setAudioPan(active.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01 }[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    event.stopPropagation();
    if (pending.current || gesture.current) return;
    const next = event.key === 'Home' ? -1 : event.key === 'End' ? 1
      : clampPan(Math.round((track.getPan() + delta!) * 1e6) / 1e6);
    setPan(next);
    void commit(next);
  };

  return (
    <button
      type="button"
      className="pan-knob"
      role="slider"
      aria-label={t('track.controls.basePan')}
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={pan}
      aria-valuetext={pan.toFixed(2)}
      title={t('track.controls.basePanTooltip', { value: pan.toFixed(2) })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={event => finishGesture(event, false)}
      onPointerCancel={event => finishGesture(event, true)}
      onLostPointerCapture={event => finishGesture(event, true)}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}
      onDoubleClick={event => {
        event.stopPropagation();
        if (pending.current || gesture.current) return;
        setPan(0);
        void commit(0);
      }}
      onKeyDown={handleKeyDown}
    >
      <span className="pan-knob-indicator" aria-hidden="true" style={{ transform: `rotate(${pan * 135}deg)` }} />
    </button>
  );
}
