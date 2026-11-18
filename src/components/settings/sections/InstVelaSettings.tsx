import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { useI18n } from '../../../i18n/useI18n';
import { INSTVELA_BASE_URL, INSTVELA_MODEL_PAGE, instVelaModelUrl } from '../../../util/instvela/modelAssets';
import { deleteInstVelaModels, instVelaModels, refreshInstVelaModels } from '../../../util/instvela/models';

export default function InstVelaSettings() {
  const { t } = useI18n();
  const models = useStore(instVelaModels);
  const [url, setUrl] = useState(INSTVELA_BASE_URL);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const config = ConfigManager.instance();
    const ready = config.getIsInitialized() ? Promise.resolve() : config.initialize();
    void ready.then(() => {
      if (mounted) {
        setUrl(config.get('general.instvela.base_url') as string || INSTVELA_BASE_URL);
        setInitialized(true);
      }
    }).catch(error => { if (mounted) setError(String(error)); });
    void refreshInstVelaModels().catch(() => {});
    return () => { mounted = false; };
  }, []);

  const saveUrl = () => {
    try {
      const normalized = instVelaModelUrl(url, '');
      setUrl(normalized);
      setError('');
      void ConfigManager.instance().set('general.instvela.base_url', normalized).catch(error => setError(String(error)));
    } catch {
      setError(t('aire.invalidUrl'));
    }
  };

  const busy = models.activity !== 'idle';
  return (
    <div className="settings-group">
      <div className="settings-group-heading">
        <h4>{t('instvela.settingsTitle')}</h4>
        <div className="settings-help">{t('instvela.credit')}{' '}
          <a href={INSTVELA_MODEL_PAGE} target="_blank" rel="noopener noreferrer">{t('aire.modelPage')}</a>
        </div>
      </div>
      <div className="settings-item">
        <label className="settings-label" htmlFor="instvela-base-url">{t('aire.baseUrl')}</label>
        <input id="instvela-base-url" className="settings-input" type="url" disabled={!initialized} value={url}
          onChange={event => setUrl(event.target.value)} onBlur={saveUrl}
          onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
        <div className="settings-help">{t('instvela.cacheHelp')}</div>
        <div className="settings-help settings-help-note" aria-live="polite">{t('instvela.cached', { count: models.cached })}</div>
        <button type="button" className="settings-btn settings-btn-danger" disabled={busy || !models.hasFiles}
          onClick={() => void deleteInstVelaModels().catch(() => {})}>
          {models.activity === 'checking' ? t('aire.checking') : t('instvela.deleteCache')}
        </button>
        {(error || models.error) && <p role="alert">{error || models.error}</p>}
      </div>
    </div>
  );
}
