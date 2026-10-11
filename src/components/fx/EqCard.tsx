import { useId, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { TbPower } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import { clamp, EQ_GAIN_RANGE, EQ_MAX_Q, EQ_MIN_Q, frequencyToPosition, positionToFrequency, previewResponseDb, type EqBand } from './eqPreview';
import './EqCard.css';
import FxKnob from './FxKnob';

export interface EqPreviewState {
  enabled: boolean;
  expanded: boolean;
  selectedBand: number;
  bands: EqBand[];
}

const WIDTH = 600;
const HEIGHT = 300;
const gainToY = (gain: number) => HEIGHT / 2 - gain / EQ_GAIN_RANGE * HEIGHT / 2;
const formatFrequency = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${Math.round(value)} Hz`;


export default function EqCard({ state, onChange }: { state: EqPreviewState; onChange: (state: EqPreviewState) => void }) {
  const { t } = useI18n();
  const bodyId = useId();
  const graph = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const selected = state.bands[state.selectedBand];
  const setBand = (index: number, update: Partial<EqBand>) => onChange({ ...state, bands: state.bands.map((band, i) => i === index ? { ...band, ...update } : band) });
  const response = Array.from({ length: 201 }, (_, i) => {
    const x = i / 200 * WIDTH;
    const gain = previewResponseDb(state.bands, positionToFrequency(i / 200));
    return `${i ? 'L' : 'M'}${x.toFixed(2)},${gainToY(gain).toFixed(2)}`;
  }).join(' ');
  const moveBand = (event: PointerEvent<SVGGElement>, index: number) => {
    if (dragging.current !== index || !graph.current) return;
    const rect = graph.current.getBoundingClientRect();
    setBand(index, {
      frequency: positionToFrequency((event.clientX - rect.left) / rect.width),
      gain: clamp((0.5 - (event.clientY - rect.top) / rect.height) * 2 * EQ_GAIN_RANGE, -EQ_GAIN_RANGE, EQ_GAIN_RANGE),
    });
  };
  const bandKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); onChange({ ...state, selectedBand: index }); return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const band = state.bands[index];
    setBand(index, event.key === 'ArrowUp' || event.key === 'ArrowDown'
      ? { gain: clamp(band.gain + (event.key === 'ArrowUp' ? 0.5 : -0.5), -EQ_GAIN_RANGE, EQ_GAIN_RANGE) }
      : { frequency: positionToFrequency(frequencyToPosition(band.frequency) + (event.key === 'ArrowRight' ? 0.01 : -0.01)) });
  };
  return (
    <section className={`fx-card${state.enabled ? '' : ' is-bypassed'}`} aria-label={t('fx.eq.title')}>
      <div className="fx-card-header" draggable>
        <button type="button" className="fx-collapse" aria-expanded={state.expanded} aria-controls={bodyId}
          title={t(state.expanded ? 'fx.collapse' : 'fx.expand')} aria-label={t(state.expanded ? 'fx.collapse' : 'fx.expand')}
          onClick={() => onChange({ ...state, expanded: !state.expanded })}>
          <span className={`arrow${state.expanded ? ' open' : ''}`} aria-hidden="true">▶</span>
        </button>
        <span className="fx-card-title" role="button" tabIndex={0} aria-label={t('fx.reorder', { effect: t('fx.eq.title') })} title={t('fx.reorderHint')}>{t('fx.eq.title')}</span>
        <button type="button" className={`fx-power${state.enabled ? ' is-on' : ''}`} aria-pressed={state.enabled}
          title={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: t('fx.eq.title') })} aria-label={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: t('fx.eq.title') })}
          onClick={() => onChange({ ...state, enabled: !state.enabled })}><TbPower aria-hidden="true" /></button>
      </div>
      <div id={bodyId} className="fx-card-body" hidden={!state.expanded}>
        <svg className="eq-graph" viewBox={`-30 -30 ${WIDTH + 60} ${HEIGHT + 60}`} role="group" aria-label={t('fx.eq.graph')}>
          <svg ref={graph} x="0" y="0" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
            <rect width={WIDTH} height={HEIGHT} fill="#000" />
            {[20, 30, 40, 50, 60, 80, 100, 200, 300, 400, 500, 600, 800, 1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 20000].map(frequency => (
              <line key={frequency} x1={frequencyToPosition(frequency) * WIDTH} x2={frequencyToPosition(frequency) * WIDTH} y1={0} y2={HEIGHT} className="eq-grid-line" />
            ))}
            {[-18, -12, -6, 0, 6, 12, 18].map(gain => <line key={gain} x1={0} x2={WIDTH} y1={gainToY(gain)} y2={gainToY(gain)} className="eq-grid-line" />)}
            <path d={response} className="eq-response" />
          </svg>
          {state.bands.map((band, index) => (
            <g key={index} className={`eq-band-point${state.selectedBand === index ? ' selected' : ''}`}
              transform={`translate(${frequencyToPosition(band.frequency) * WIDTH},${gainToY(band.gain)})`}
              role="button" tabIndex={0} aria-pressed={state.selectedBand === index}
              aria-label={t('fx.eq.band', { number: index + 1 })}
              onClick={() => onChange({ ...state, selectedBand: index })}
              onPointerDown={event => {
                if (event.button !== 0) return;
                event.preventDefault(); event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragging.current = index;
                onChange({ ...state, selectedBand: index });
              }}
              onPointerMove={event => moveBand(event, index)}
              onPointerUp={event => { dragging.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              onPointerCancel={() => { dragging.current = null; }} onLostPointerCapture={() => { dragging.current = null; }}
              onKeyDown={event => bandKeyDown(event, index)}>
              <circle r={23} /><text textAnchor="middle" dominantBaseline="central">{index + 1}</text>
            </g>
          ))}
        </svg>
        <div className="eq-controls">
          <span className="eq-band-number" aria-label={t('fx.eq.band', { number: state.selectedBand + 1 })}>{state.selectedBand + 1}</span>
          <div className="fx-parameters">
            <FxKnob label={t('fx.eq.frequency')} valueText={formatFrequency(selected.frequency)} position={frequencyToPosition(selected.frequency)}
              onChange={position => setBand(state.selectedBand, { frequency: positionToFrequency(position) })} onReset={() => setBand(state.selectedBand, { frequency: [200, 1350, 6500][state.selectedBand] })} />
            <FxKnob label={t('fx.eq.q')} valueText={selected.q.toFixed(2)} position={Math.log(selected.q / EQ_MIN_Q) / Math.log(EQ_MAX_Q / EQ_MIN_Q)}
              onChange={position => setBand(state.selectedBand, { q: EQ_MIN_Q * Math.pow(EQ_MAX_Q / EQ_MIN_Q, position) })} onReset={() => setBand(state.selectedBand, { q: 0.5 })} />
            <FxKnob label={t('fx.eq.gain')} valueText={`${selected.gain.toFixed(1)} dB`} position={(selected.gain + EQ_GAIN_RANGE) / (2 * EQ_GAIN_RANGE)}
              onChange={position => setBand(state.selectedBand, { gain: (position * 2 - 1) * EQ_GAIN_RANGE })} onReset={() => setBand(state.selectedBand, { gain: 0 })} />
          </div>
        </div>
      </div>
    </section>
  );
}
