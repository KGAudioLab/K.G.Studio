import { useId } from 'react';
import { TbPower } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import FxKnob from './FxKnob';
import FxDeleteButton from './FxDeleteButton';
import FxLevelControl from './FxLevelControl';
import { getFXDefaults } from '../../core/fx/fxDefaults';
import './CompressorCard.css';

export interface CompressorPreviewState {
  enabled: boolean;
  expanded: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  gain: number;
}

export default function CompressorCard({ state, onChange, onRemove }: {
  state: CompressorPreviewState;
  onChange: (state: CompressorPreviewState) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  const title = t('fx.compressor.title');
  return (
    <section className={`fx-card compressor-card${state.enabled ? '' : ' is-bypassed'}`} aria-label={title}>
      <div className="fx-card-header" draggable>
        <button type="button" className="fx-collapse" aria-expanded={state.expanded} aria-controls={bodyId}
          title={t(state.expanded ? 'fx.collapse' : 'fx.expand')} aria-label={t(state.expanded ? 'fx.collapse' : 'fx.expand')}
          onClick={() => onChange({ ...state, expanded: !state.expanded })}>
          <span className={`arrow${state.expanded ? ' open' : ''}`} aria-hidden="true">▶</span>
        </button>
        <span className="fx-card-title" role="button" tabIndex={0} aria-label={t('fx.reorder', { effect: t('fx.compressor.title') })} title={t('fx.reorderHint')}>{title}</span>
        <FxDeleteButton effect={title} onRemove={onRemove} />
        <button type="button" className={`fx-power${state.enabled ? ' is-on' : ''}`} aria-pressed={state.enabled}
          title={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          aria-label={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          onClick={() => onChange({ ...state, enabled: !state.enabled })}><TbPower aria-hidden="true" /></button>
      </div>
      <div id={bodyId} className="fx-card-body" hidden={!state.expanded}>
        <FxLevelControl label={t('fx.compressor.threshold')} value={state.threshold}
          onChange={threshold => onChange({ ...state, threshold })} onReset={() => onChange({ ...state, threshold: getFXDefaults().compressor.thresholdDb })} />
        <div className="fx-dynamics-parameters">
          <FxKnob label={t('fx.compressor.ratio')} valueText={`${state.ratio.toFixed(1)}:1`} position={(state.ratio - 1) / 19}
            onChange={position => onChange({ ...state, ratio: 1 + position * 19 })} onReset={() => onChange({ ...state, ratio: getFXDefaults().compressor.ratio })} />
          <FxKnob label={t('fx.compressor.attack')} valueText={`${state.attack.toFixed(1)} ms`} position={state.attack / 1000}
            onChange={position => onChange({ ...state, attack: position * 1000 })} onReset={() => onChange({ ...state, attack: getFXDefaults().compressor.attackMs })} />
          <FxKnob label={t('fx.compressor.release')} valueText={`${state.release.toFixed(0)} ms`} position={state.release / 1000}
            onChange={position => onChange({ ...state, release: position * 1000 })} onReset={() => onChange({ ...state, release: getFXDefaults().compressor.releaseMs })} />
          <FxKnob label={t('fx.compressor.gain')} valueText={`${state.gain.toFixed(1)} dB`} position={(state.gain + 24) / 48}
            onChange={position => onChange({ ...state, gain: position * 48 - 24 })} onReset={() => onChange({ ...state, gain: getFXDefaults().compressor.gainDb })} />
        </div>
      </div>
    </section>
  );
}
