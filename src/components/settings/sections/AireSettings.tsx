import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { AIRE_BASE_URL, AIRE_MODELS, AIRE_MODEL_IDS, aireCache, aireModelUrl, deleteAireModels } from '../../../util/aire/config';
import { useI18n } from '../../../i18n/useI18n';
export default function AireSettings() {
  const { t } = useI18n();
  const [url, setUrl] = useState(AIRE_BASE_URL);
  const [cached, setCached] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUrl = useRef<string | null>(null);
  const alive = useRef(true);
  const flushSave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pendingUrl.current;
    pendingUrl.current = null;
    if (value == null) return;
    void ConfigManager.instance().set('general.aire.base_url', value).catch(e => { if (alive.current) setError(String(e)); });
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; flushSave(); };
  }, [flushSave]);
  const refresh = useCallback(async () => {
    setCached((await Promise.all(AIRE_MODEL_IDS.map(id => aireCache.exists(AIRE_MODELS[id].path)))).filter(Boolean).length);
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const config = ConfigManager.instance();
        if (!config.getIsInitialized()) await config.initialize();
        if (!mounted) return;
        setUrl(config.get('general.aire.base_url') as string || AIRE_BASE_URL);
        await refresh();
      } catch (e) { if (mounted) setError(String(e)); }
      finally { if (mounted) setBusy(false); }
    })();
    return () => { mounted = false; };
  }, [refresh]);
  const save = (value: string) => {
    setUrl(value);
    if (timer.current) clearTimeout(timer.current);
    pendingUrl.current = null;
    try { aireModelUrl(value, 'S03'); setError(''); }
    catch { setError(t('aire.invalidUrl')); return; }
    pendingUrl.current = value.trim();
    timer.current = setTimeout(flushSave, 500);
  };
  return <div className="settings-group">
    <div className="settings-group-heading">
      <h4>{t('aire.settingsTitle')}</h4>
      <div className="settings-help">{t('aire.subtitle')}</div>
    </div>
    <div className="settings-item">
      <label className="settings-label" htmlFor="aire-base-url">{t('aire.baseUrl')}</label>
      <input id="aire-base-url" className="settings-input" type="url" value={url} onChange={e => save(e.target.value)} onBlur={flushSave} />
      <div className="settings-help">{t('aire.cacheHelp')}</div>
      <div className="settings-help settings-help-note" aria-live="polite">{t('aire.cached', { count: cached })}</div>
      <button type="button" className="settings-btn settings-btn-danger" disabled={busy || cached === 0}
        onClick={() => {
          setBusy(true); setError('');
          void deleteAireModels().then(refresh).catch(e => setError(String(e))).finally(() => setBusy(false));
        }}>{busy ? t('aire.checking') : t('aire.deleteCache')}</button>
      {error && <p role="alert">{error}</p>}
    </div>
  </div>;
}
