import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbTrash, TbX } from 'react-icons/tb';
import { useI18n } from '../../i18n/useI18n';
import type { KGFX } from '../../core/fx';
import { createDefaultFXChain } from '../../core/fx/defaultFXChain';
import { fxPresetStorage, type FXPresetEntry } from '../../core/io/FXPresetStorage';
import { showAlert, showConfirm } from '../../util/dialogUtil';
import { fxParameterSummary } from './fxParameterSummary';
import '../common/DialogProvider.css';
import './ImportFxDialog.css';
import './LoadFxPresetDialog.css';

export default function LoadFxPresetDialog({ onClose, onLoad }: {
  onClose: () => void;
  onLoad: (effects: readonly KGFX[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<FXPresetEntry[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null); // null is the bundled Default, never an OPFS filename.
  const [defaults] = useState(createDefaultFXChain);
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(true);
  const modal = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const working = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const focusDefault = useRef(false);
  const outside = useRef(false);
  const titleId = useId(); const hintId = useId();
  const selected = selectedName === null ? { name: t('fx.preset.default'), effects: defaults } : entries.find(entry => entry.name === selectedName);
  const run = async (action: () => Promise<void>) => {
    if (working.current) return;
    working.current = true; setBusy(true);
    const focused = document.activeElement as HTMLElement | null;
    try { await action(); }
    catch { if (alive.current) await showAlert(t('fx.preset.error')); }
    finally {
      working.current = false;
      if (alive.current) { restoreFocus.current = focused; setBusy(false); }
    }
  };
  useEffect(() => {
    if (busy) return;
    const target = focusDefault.current ? modal.current?.querySelector<HTMLButtonElement>('.fx-preset-select[aria-pressed="true"]') : restoreFocus.current;
    focusDefault.current = false; restoreFocus.current = null;
    if (target?.isConnected) target.focus();
  }, [busy, entries, selectedName]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void fxPresetStorage.list().then(result => { if (!cancelled) setEntries(result); })
      .catch(async () => { if (!cancelled) await run(async () => { await showAlert(t('fx.preset.error')); }); })
      .finally(() => { if (!cancelled) setListing(false); });
    return () => { cancelled = true; alive.current = false; };
    // Load the directory once per dialog opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      // Shared confirmations sit above this dialog and own focus while an action is pending.
      const nested = working.current ? document.querySelector<HTMLElement>('.dialog-overlay') : null;
      const root = nested ?? modal.current;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (nested) nested.querySelector<HTMLButtonElement>('.dialog-close-btn')?.click();
        else if (!working.current) onClose();
      } else {
        if (event.key === 'Tab') {
          const controls = Array.from(root?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
          const first = controls[0]; const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        } else if (nested && event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault(); nested.querySelector<HTMLButtonElement>('.dialog-btn-primary')?.click();
        } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', keydown, true);
    return () => { window.removeEventListener('keydown', keydown, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  const remove = (name: string) => void run(async () => {
    if (!await showConfirm(t('fx.preset.deleteConfirm', { name }), { confirmLabel: t('fx.preset.delete'), cancelLabel: t('dialog.cancel') })) return;
    if (!alive.current) return;
    await fxPresetStorage.delete(name);
    if (!alive.current) return;
    focusDefault.current = true;
    setEntries(previous => previous.filter(entry => entry.name !== name));
    setSelectedName(null);
  });
  const load = () => void run(async () => {
    if (!selected?.effects) return;
    const effects = selectedName === null ? createDefaultFXChain() : await fxPresetStorage.read(selectedName);
    if (!alive.current) return;
    if (await onLoad(effects) && alive.current) onClose();
  });
  const entry = (name: string | null, display: string, effects: KGFX[] | null) => (
    <div key={name ?? 'bundled-default'} className={`fx-preset-item${selectedName === name ? ' active' : ''}`}>
      <button type="button" className="fx-preset-select" disabled={busy} aria-pressed={selectedName === name} onClick={() => setSelectedName(name)}>
        <span title={display}>{display}</span><small>{effects === null ? t('fx.preset.unavailable') : t(effects.length === 1 ? 'fx.preset.countOne' : 'fx.preset.count', { count: effects.length })}</small>
      </button>
      {name !== null && <button type="button" className="fx-preset-trash" disabled={busy} aria-label={t('fx.preset.deleteNamed', { name: display })} onClick={() => remove(name)}><TbTrash aria-hidden="true" /></button>}
    </div>
  );
  return createPortal(<div className="fx-import-backdrop fx-preset-backdrop" onMouseDown={event => { outside.current = event.target === event.currentTarget; }}
    onClick={event => { if (!working.current && outside.current && event.target === event.currentTarget) onClose(); }}>
    <div ref={modal} className="fx-import-dialog fx-preset-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={hintId} aria-busy={busy || listing}>
      <header><h2 id={titleId}>{t('fx.preset.loadTitle')}</h2><button type="button" disabled={busy} aria-label={t('fx.addDialog.close')} onClick={onClose}><TbX aria-hidden="true" /></button></header>
      <div className="fx-import-body">
        <aside><div className="fx-import-tracks fx-preset-list">{entry(null, t('fx.preset.default'), defaults)}{entries.map(item => entry(item.name, item.name, item.effects))}</div></aside>
        <main><div id={hintId} className="fx-import-hint">{t('fx.preset.hint')}</div>
          <div className="fx-import-table"><table><thead><tr><th>{t('fx.importDialog.fxName')}</th><th>{t('fx.importDialog.parameters')}</th></tr></thead><tbody>
            {selected?.effects?.map(effect => { const name = t(`fx.${effect.getType()}.title`); const summary = fxParameterSummary(effect, t);
              return <tr key={effect.getId()}><td title={name}>{name}</td><td title={summary}>{summary}</td></tr>; })}
          </tbody></table>{(!selected?.effects || selected.effects.length === 0) && <p className="fx-import-empty">{t(selected?.effects ? 'fx.preset.empty' : 'fx.preset.unavailable')}</p>}</div>
          <div className="dialog-footer"><button type="button" className="dialog-btn dialog-btn-cancel" disabled={busy} onClick={onClose}>{t('dialog.cancel')}</button>
            <button type="button" className="dialog-btn fx-preset-delete" disabled={busy || selectedName === null || !selected} onClick={() => { if (selectedName !== null) remove(selectedName); }}>{t('fx.preset.delete')}</button>
            <button type="button" className="dialog-btn dialog-btn-primary" disabled={busy || !selected?.effects} onClick={load}>{t('fx.load')}</button></div>
        </main>
      </div>
    </div>
  </div>, document.body);
}
