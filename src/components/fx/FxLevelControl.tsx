import { useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { clamp } from './eqPreview';
import './CompressorCard.css';

export default function FxLevelControl({ label, value, onChange, onReset, children, minDb = -100, maxDb = 0 }: {
  children?: ReactNode; minDb?: number; maxDb?: number;
  label: string; value: number;
  onChange: (value: number) => void; onReset: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId || !surface.current) return;
    const rect = surface.current.getBoundingClientRect();
    onChange(clamp(maxDb - (event.clientY - rect.top) / rect.height * (maxDb - minDb), -100, 0));
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className="fx-level-display">
      <div className="fx-level-readout"><span>{label}</span><span>{value.toFixed(1)} dB</span></div>
      <div className="fx-level-surface" ref={surface}>
        {children}
        <button type="button" className="fx-level-line" role="slider"
          aria-label={label} aria-orientation="vertical" aria-valuemin={-100} aria-valuemax={0}
          aria-valuenow={Number(value.toFixed(1))} aria-valuetext={`${value.toFixed(1)} dB`} style={{ top: `${clamp((maxDb - value) / (maxDb - minDb) * 100, 0, 100)}%` }}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            pointer.current = event.pointerId;
          }}
          onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
          onDoubleClick={onReset}
          onKeyDown={event => {
            const step = event.shiftKey ? 0.1 : 1;
            const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[event.key];
            if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault(); event.stopPropagation();
            onChange(event.key === 'Home' ? -100 : event.key === 'End' ? 0 : clamp(value + delta!, -100, 0));
          }}>
          <span className="fx-level-handle" aria-hidden="true"><span>▲</span><span>▼</span></span>
        </button>
      </div>
    </div>
  );
}
