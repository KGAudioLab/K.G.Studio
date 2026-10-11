import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbX } from 'react-icons/tb';
import { KGTrack, TrackType } from '../../core/track/KGTrack';
import { useI18n } from '../../i18n/useI18n';
import { fxParameterSummary } from './fxParameterSummary';
import './ImportFxDialog.css';

export default function ImportFxDialog({ tracks, onClose, onImport }: {
  tracks: readonly KGTrack[];
  onClose: () => void;
  onImport: (source: KGTrack, effectId: number) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const hintId = useId();
  const modal = useRef<HTMLDivElement>(null);
  const outsideMouseDown = useRef(false);
  const [selectedTrack, setSelectedTrack] = useState<KGTrack | null>(null);
  const sources = tracks.filter(track => track.getType() === TrackType.MIDI || track.getType() === TrackType.Wave);
  const selected = selectedTrack && sources.includes(selectedTrack) ? selectedTrack : null;
  const effects = selected?.getFX() ?? [];
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); onClose();
      } else if (event.key === 'Tab') {
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), tr[tabindex="0"]') ?? []);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        event.stopPropagation();
      } else {
        // Handle row activation before isolating app shortcuts in the capture phase.
        if (event.key === 'Enter' || event.key === ' ') {
          const row = (event.target as HTMLElement).closest<HTMLElement>('.fx-import-table tbody tr');
          if (row && modal.current?.contains(row)) { event.preventDefault(); row.click(); }
        }
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);
  return createPortal(
    <div className="fx-import-backdrop" onMouseDown={event => { outsideMouseDown.current = event.target === event.currentTarget; }}
      onClick={event => { if (outsideMouseDown.current && event.target === event.currentTarget) onClose(); }}>
      <div ref={modal} className="fx-import-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId}>
        <header>
          <h2 id={titleId}>{t('fx.importDialog.title')}</h2>
          <button type="button" aria-label={t('fx.addDialog.close')} onClick={onClose}><TbX aria-hidden="true" /></button>
        </header>
        <div className="fx-import-body">
          <aside><div className="fx-import-tracks">{sources.map(source => (
            <button type="button" key={source.getId()} className={selected === source ? 'active' : ''} aria-pressed={selected === source}
              onClick={() => setSelectedTrack(source)}>
              <span title={source.getName()}>{source.getName()}</span>
              <small>{t(source.getType() === TrackType.Wave ? 'fx.importDialog.audioTrack' : 'fx.importDialog.midiTrack')}</small>
            </button>
          ))}</div></aside>
          <main>
            <div id={hintId} className="fx-import-hint">{t('fx.importDialog.hint')}</div>
            <div className="fx-import-table"><table>
              <thead><tr><th>{t('fx.importDialog.fxName')}</th><th>{t('fx.importDialog.parameters')}</th></tr></thead>
              <tbody>{effects.map(effect => {
                const name = t(`fx.${effect.getType()}.title`);
                const summary = fxParameterSummary(effect, t);
                return <tr key={effect.getId()} tabIndex={0} aria-label={`${name}: ${summary}`}
                  onClick={() => { if (selected) onImport(selected, effect.getId()); }}><td title={name}>{name}</td><td title={summary}>{summary}</td></tr>;
              })}</tbody>
            </table>{effects.length === 0 && <p className="fx-import-empty">{t(selected ? 'fx.importDialog.empty' : 'fx.importDialog.selectTrack')}</p>}</div>
          </main>
        </div>
      </div>
    </div>, document.body,
  );
}
