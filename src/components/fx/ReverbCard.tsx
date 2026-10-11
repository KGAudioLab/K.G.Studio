import { useId } from 'react';
import { TbChevronLeft, TbChevronRight, TbPower } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import FxKnob from './FxKnob';
import FxDeleteButton from './FxDeleteButton';
import './ReverbCard.css';

const REVERB_TYPES = ['hall', 'room', 'chamber', 'plate', 'spring'] as const;
export interface ReverbPreviewState {
  enabled: boolean;
  expanded: boolean;
  type: typeof REVERB_TYPES[number];
  mix: number;
}

export default function ReverbCard({ state, onChange, onRemove }: {
  state: ReverbPreviewState;
  onChange: (state: ReverbPreviewState) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  const title = t('fx.reverb.title');
  const changeType = (delta: number) => {
    const index = (REVERB_TYPES.indexOf(state.type) + delta + REVERB_TYPES.length) % REVERB_TYPES.length;
    onChange({ ...state, type: REVERB_TYPES[index] });
  };
  return (
    <section className={`fx-card reverb-card${state.enabled ? '' : ' is-bypassed'}`} aria-label={title}>
      <div className="fx-card-header" draggable>
        <button type="button" className="fx-collapse" aria-expanded={state.expanded} aria-controls={bodyId}
          title={t(state.expanded ? 'fx.collapse' : 'fx.expand')} aria-label={t(state.expanded ? 'fx.collapse' : 'fx.expand')}
          onClick={() => onChange({ ...state, expanded: !state.expanded })}>
          <span className={`arrow${state.expanded ? ' open' : ''}`} aria-hidden="true">▶</span>
        </button>
        <span className="fx-card-title" role="button" tabIndex={0} aria-label={t('fx.reorder', { effect: t('fx.reverb.title') })} title={t('fx.reorderHint')}>{title}</span>
        <FxDeleteButton effect={title} onRemove={onRemove} />
        <button type="button" className={`fx-power${state.enabled ? ' is-on' : ''}`} aria-pressed={state.enabled}
          title={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          aria-label={t(state.enabled ? 'fx.disable' : 'fx.enable', { effect: title })}
          onClick={() => onChange({ ...state, enabled: !state.enabled })}><TbPower aria-hidden="true" /></button>
      </div>
      <div id={bodyId} className="fx-card-body reverb-controls" hidden={!state.expanded}>
        <div className="reverb-type-selector" role="group" aria-label={t('fx.reverb.type')}>
          <button type="button" className="reverb-type-arrow" title={t('fx.reverb.previous')} aria-label={t('fx.reverb.previous')}
            onClick={() => changeType(-1)}><TbChevronLeft aria-hidden="true" /></button>
          <span className="reverb-type-name" aria-live="polite">{t(`fx.reverb.type.${state.type}`)}</span>
          <button type="button" className="reverb-type-arrow" title={t('fx.reverb.next')} aria-label={t('fx.reverb.next')}
            onClick={() => changeType(1)}><TbChevronRight aria-hidden="true" /></button>
        </div>
        <FxKnob label={t('fx.reverb.mix')} valueText={`${Math.round(state.mix * 100)}%`} position={state.mix}
          onChange={mix => onChange({ ...state, mix })} onReset={() => onChange({ ...state, mix: 0.1 })} />
      </div>
    </section>
  );
}
