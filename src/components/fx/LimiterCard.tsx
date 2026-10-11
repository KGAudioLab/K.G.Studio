import { useId } from 'react';
import { TbPower } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import FxKnob from './FxKnob';
import FxDeleteButton from './FxDeleteButton';
import FxLevelControl from './FxLevelControl';

export interface LimiterPreviewState {
  enabled: boolean;
  expanded: boolean;
  inputGain: number;
  threshold: number;
}

export default function LimiterCard({ state, onChange, onRemove }: {
  state: LimiterPreviewState;
  onChange: (state: LimiterPreviewState) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  const title = t('fx.limiter.title');
  return (
    <section className={`fx-card limiter-card${state.enabled ? '' : ' is-bypassed'}`} aria-label={title}>
      <div className="fx-card-header" draggable>
        <button type="button" className="fx-collapse" aria-expanded={state.expanded} aria-controls={bodyId}
          title={t(state.expanded ? 'fx.collapse' : 'fx.expand')} aria-label={t(state.expanded ? 'fx.collapse' : 'fx.expand')}
          onClick={() => onChange({ ...state, expanded: !state.expanded })}>
          <span className={`arrow${state.expanded ? ' open' : ''}`} aria-hidden="true">▶</span>
        </button>
        <span className="fx-card-title" role="button" tabIndex={0} aria-label={t('fx.reorder', { effect: t('fx.limiter.title') })} title={t('fx.reorderHint')}>{title}</span>
        <FxDeleteButton effect={title} onRemove={onRemove} />
        <button type="button" className={`fx-power${state.enabled ? ' is-on' : ''}`} aria-pressed={state.enabled}
          title={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          aria-label={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          onClick={() => onChange({ ...state, enabled: !state.enabled })}><TbPower aria-hidden="true" /></button>
      </div>
      <div id={bodyId} className="fx-card-body" hidden={!state.expanded}>
        <FxLevelControl label={t('fx.limiter.threshold')} value={state.threshold}
          onChange={threshold => onChange({ ...state, threshold })} onReset={() => onChange({ ...state, threshold: -4.1 })} />
        <div className="fx-dynamics-parameters">
          <FxKnob label={t('fx.limiter.inputGain')} valueText={`${state.inputGain.toFixed(1)} dB`} position={(state.inputGain + 24) / 48}
            onChange={position => onChange({ ...state, inputGain: position * 48 - 24 })} onReset={() => onChange({ ...state, inputGain: 0 })} />
          <FxKnob label={t('fx.limiter.threshold')} valueText={`${state.threshold.toFixed(1)} dB`} position={(state.threshold + 100) / 100}
            onChange={position => onChange({ ...state, threshold: position * 100 - 100 })} onReset={() => onChange({ ...state, threshold: -4.1 })} />
        </div>
      </div>
    </section>
  );
}
