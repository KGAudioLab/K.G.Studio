import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbX } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import type { FxType } from './fxPreviewState';
import '../common/DialogProvider.css';
import '../common/TrackCreateDialog.css';
import './AddFxDialog.css';

const TYPES: FxType[] = ['eq', 'reverb', 'compressor', 'limiter'];

export default function AddFxDialog({ onCancel, onAdd }: {
  onCancel: () => void; onAdd: (type: FxType) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const modal = useRef<HTMLDivElement>(null);
  const outsideMouseDown = useRef(false);
  const [selected, setSelected] = useState<FxType>('eq');
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>('.fx-create-option')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); onCancel();
      } else if (event.key === 'Tab') {
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } else {
        // Keep app-level shortcuts out of the dialog while preserving button keyboard behavior.
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onCancel]);
  return createPortal(
    <div className="dialog-overlay" onMouseDown={event => { outsideMouseDown.current = event.target === event.currentTarget; }}
      onClick={event => { if (outsideMouseDown.current && event.target === event.currentTarget) onCancel(); }}>
      <div ref={modal} className="dialog-modal track-create-dialog-modal fx-create-dialog-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-header">
          <h3 id={titleId} className="dialog-title">{t('fx.addDialog.title')}</h3>
          <button type="button" className="dialog-close-btn" aria-label={t('fx.addDialog.close')} onClick={onCancel}><TbX aria-hidden="true" /></button>
        </div>
        <div className="dialog-body track-create-dialog-body">
          {TYPES.map(type => (
            <button key={type} type="button" className={`track-create-option fx-create-option${selected === type ? ' selected' : ''}`}
              aria-pressed={selected === type} onClick={() => setSelected(type)}>
              <img src={`${import.meta.env.BASE_URL}resources/fx/${type}.png`} alt="" draggable={false} />
              <span className="track-create-option-label">{t(`fx.${type}.title`)}</span>
            </button>
          ))}
        </div>
        <div className="dialog-footer">
          <button type="button" className="dialog-btn dialog-btn-cancel" onClick={onCancel}>{t('fx.addDialog.cancel')}</button>
          <button type="button" className="dialog-btn dialog-btn-primary" onClick={() => onAdd(selected)}>{t('fx.add')}</button>
        </div>
      </div>
    </div>, document.body,
  );
}
