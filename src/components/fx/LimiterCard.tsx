import { useId } from 'react';
import { TbPower } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import FxKnob from './FxKnob';
import FxLevelControl from './FxLevelControl';

export interface LimiterPreviewState {
  enabled: boolean;
  expanded: boolean;
  gain: number;
  ceiling: number;
  attack: number;
  release: number;
}

export default function LimiterCard({ state, onChange }: {
  state: LimiterPreviewState;
  onChange: (state: LimiterPreviewState) => void;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  const title = t('fx.limiter.title');
  return (
    <section className={`fx-card limiter-card${state.enabled ? '' : ' is-bypassed'}`} aria-label={title}>
      <div className="fx-card-header">
        <button type="button" className="fx-collapse" aria-expanded={state.expanded} aria-controls={bodyId}
          title={t(state.expanded ? 'fx.collapse' : 'fx.expand')} aria-label={t(state.expanded ? 'fx.collapse' : 'fx.expand')}
          onClick={() => onChange({ ...state, expanded: !state.expanded })}>
          <span className={`arrow${state.expanded ? ' open' : ''}`} aria-hidden="true">▶</span>
        </button>
        <span className="fx-card-title">{title}</span>
        <button type="button" className={`fx-power${state.enabled ? ' is-on' : ''}`} aria-pressed={state.enabled}
          title={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          aria-label={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          onClick={() => onChange({ ...state, enabled: !state.enabled })}><TbPower aria-hidden="true" /></button>
      </div>
      <div id={bodyId} className="fx-card-body" hidden={!state.expanded}>
        <FxLevelControl label={t('fx.limiter.ceiling')} value={state.ceiling}
          onChange={ceiling => onChange({ ...state, ceiling })} onReset={() => onChange({ ...state, ceiling: -4.1 })} />
        <div className="fx-dynamics-parameters">
          <FxKnob label={t('fx.compressor.gain')} valueText={`${state.gain.toFixed(1)} dB`} position={(state.gain + 24) / 48}
            onChange={position => onChange({ ...state, gain: position * 48 - 24 })} onReset={() => onChange({ ...state, gain: 0 })} />
          <FxKnob label={t('fx.limiter.ceiling')} valueText={`${state.ceiling.toFixed(1)} dB`} position={(state.ceiling + 100) / 100}
            onChange={position => onChange({ ...state, ceiling: position * 100 - 100 })} onReset={() => onChange({ ...state, ceiling: -4.1 })} />
          <FxKnob label={t('fx.compressor.attack')} valueText={`${state.attack.toFixed(1)} ms`} position={state.attack / 1000}
            onChange={position => onChange({ ...state, attack: position * 1000 })} onReset={() => onChange({ ...state, attack: 5 })} />
          <FxKnob label={t('fx.compressor.release')} valueText={`${state.release.toFixed(0)} ms`} position={state.release / 1000}
            onChange={position => onChange({ ...state, release: position * 1000 })} onReset={() => onChange({ ...state, release: 50 })} />
        </div>
      </div>
    </section>
  );
}
