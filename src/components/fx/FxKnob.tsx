import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { clamp } from './eqPreview';
import './EqCard.css';

export default function FxKnob({ label, valueText, position, onChange, onReset, disabled = false }: {
  label: string; valueText: string; position: number;
  onChange: (position: number) => void; onReset: () => void;
  disabled?: boolean;
}) {
  const gesture = useRef<{ pointerId: number; y: number; position: number } | null>(null);
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <div className={`fx-parameter${disabled ? ' is-disabled' : ''}`}>
      <button type="button" className="fx-knob" role="slider" aria-label={label} disabled={disabled}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(position * 100)} aria-valuetext={valueText}
        onPointerDown={event => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { pointerId: event.pointerId, y: event.clientY, position };
        }}
        onPointerMove={event => {
          const active = gesture.current;
          if (!disabled && active?.pointerId === event.pointerId) onChange(clamp(active.position + (active.y - event.clientY) / 150, 0, 1));
        }}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onDoubleClick={disabled ? undefined : onReset}
        onKeyDown={event => {
          if (disabled) return;
          const step = event.shiftKey ? 0.001 : 0.01;
          const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[event.key];
          if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          event.stopPropagation();
          onChange(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : clamp(position + delta!, 0, 1));
        }}>
        <span className="fx-knob-indicator" aria-hidden="true" style={{ transform: `rotate(${position * 270 - 135}deg)` }} />
      </button>
      <div className="fx-parameter-text"><span>{valueText}</span><span className="fx-parameter-label">{label}</span></div>
    </div>
  );
}

