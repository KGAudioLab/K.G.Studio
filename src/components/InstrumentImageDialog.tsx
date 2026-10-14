import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbX } from 'react-icons/tb';
import availableImages from 'virtual:instrument-images';
import imageOrder from 'virtual:instrument-image-order';
import { useI18n } from '../i18n/useI18n';
import './common/DialogProvider.css';
import './common/TrackCreateDialog.css';
import './InstrumentImageDialog.css';

const images = [...new Set(imageOrder)].filter(name => availableImages.includes(name));
// Keep any additional folder assets available, after the ordered catalog.
images.push(...availableImages.filter(name => !images.includes(name)));

export default function InstrumentImageDialog({ imageName, onCancel, onConfirm }: {
  imageName: string; onCancel: () => void;
  // eslint-disable-next-line no-unused-vars -- callback parameter is a TypeScript type declaration
  onConfirm: (imageName: string) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const modal = useRef<HTMLDivElement>(null);
  const outsideMouseDown = useRef(false);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const [selected, setSelected] = useState(imageName);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const active = modal.current?.querySelector<HTMLButtonElement>('.track-image-option.selected')
      ?? modal.current?.querySelector<HTMLButtonElement>('.track-image-option');
    active?.focus();
    active?.scrollIntoView?.({ block: 'nearest' });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); cancel.current();
      } else if (event.key === 'Tab') {
        event.stopPropagation();
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      } else {
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(
    <div className="dialog-overlay" onMouseDown={event => { outsideMouseDown.current = event.target === event.currentTarget; }}
      onClick={event => { if (outsideMouseDown.current && event.target === event.currentTarget) cancel.current(); }}>
      <div ref={modal} className="dialog-modal track-image-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-header">
          <h3 id={titleId} className="dialog-title">{t('trackImage.title')}</h3>
          <button type="button" className="dialog-close-btn" aria-label={t('trackImage.close')} onClick={onCancel}><TbX aria-hidden="true" /></button>
        </div>
        <div className="dialog-body track-image-grid">
          {images.map(name => (
            <button key={name} type="button" className={`track-create-option track-image-option${selected === name ? ' selected' : ''}`}
              aria-label={name.replace(/\.png$/i, '').replace(/_/g, ' ')}
              aria-pressed={selected === name} onClick={() => setSelected(name)}>
              <img src={`${import.meta.env.BASE_URL}resources/instruments/${name}`} alt="" draggable={false} />
            </button>
          ))}
        </div>
        <div className="dialog-footer">
          <button type="button" className="dialog-btn dialog-btn-cancel" onClick={onCancel}>{t('trackImage.cancel')}</button>
          <button type="button" className="dialog-btn dialog-btn-primary" disabled={!images.includes(selected)} onClick={() => onConfirm(selected)}>{t('trackImage.ok')}</button>
        </div>
      </div>
    </div>, document.body,
  );
}
