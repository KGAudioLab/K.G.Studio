import AireSettings from './AireSettings';
import React, { useState, useEffect, useCallback } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { LocalSeparatorModelCache } from '../../../util/local-separator/modelCache';
import { SoundfontInstrumentCache, type SoundfontCacheSummary } from '../../../util/soundfontInstrumentCache';
import { useI18n } from '../../../i18n/useI18n';
import type { LanguageSetting } from '../../../i18n/types';
import {
  LOCAL_SEPARATOR_MODEL_CONFIGS,
  LOCAL_SEPARATOR_MODEL_IDS,
} from '../../../util/local-separator/config';

const LANGUAGE_OPTION_LABELS: Record<Exclude<LanguageSetting, 'auto'>, string> = {
  en_us: 'English',
  fr_fr: 'Français',
  zh_cn: '简体中文',
  zh_hk: '繁體中文',
};

const GeneralSettings: React.FC = () => {
  const { t, setLanguageSetting } = useI18n();
  const [language, setLanguage] = useState<LanguageSetting>('auto');
  const [soundfontBaseUrl, setSoundfontBaseUrl] = useState<string>('');
  const [soundfontServerManaged, setSoundfontServerManaged] = useState<boolean>(false);
  const [soundfontCacheSummary, setSoundfontCacheSummary] = useState<SoundfontCacheSummary>({ instrumentCount: 0, instruments: [] });
  const [isCheckingSoundfontCache, setIsCheckingSoundfontCache] = useState<boolean>(false);
  const [isDeletingSoundfontCache, setIsDeletingSoundfontCache] = useState<boolean>(false);
  const [selectedCachedSoundfontInstrument, setSelectedCachedSoundfontInstrument] = useState<string>('');
  const [isDeletingCachedSoundfontInstrument, setIsDeletingCachedSoundfontInstrument] = useState<boolean>(false);
  const [uvr5ModelUrl, setUvr5ModelUrl] = useState<string>('');
  const [htdemucsModelUrl, setHtdemucsModelUrl] = useState<string>('');
  const [isUvr5ModelCached, setIsUvr5ModelCached] = useState<boolean>(false);
  const [isCheckingUvr5ModelCache, setIsCheckingUvr5ModelCache] = useState<boolean>(false);
  const [isDeletingUvr5Model, setIsDeletingUvr5Model] = useState<boolean>(false);
  const [isHtdemucsModelCached, setIsHtdemucsModelCached] = useState<boolean>(false);
  const [isDeletingHtdemucsModel, setIsDeletingHtdemucsModel] = useState<boolean>(false);

  const configManager = ConfigManager.instance();

  const refreshUvr5ModelCacheState = useCallback(async () => {
    setIsCheckingUvr5ModelCache(true);
    try {
      const [mdxCached, demucsCached] = await Promise.all([
        LocalSeparatorModelCache.exists(LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium]),
        LocalSeparatorModelCache.exists(LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s]),
      ]);
      setIsUvr5ModelCached(mdxCached);
      setIsHtdemucsModelCached(demucsCached);
    } catch (error) {
      console.error('Failed to check UVR5 cached model state:', error);
      setIsUvr5ModelCached(false);
      setIsHtdemucsModelCached(false);
    } finally {
      setIsCheckingUvr5ModelCache(false);
    }
  }, []);

  const refreshSoundfontCacheState = useCallback(async () => {
    setIsCheckingSoundfontCache(true);
    try {
      const currentBaseUrl = ((configManager.get('general.soundfont.base_url') as string) || '').trim();
      if (!currentBaseUrl) {
        setSoundfontCacheSummary({ instrumentCount: 0, instruments: [] });
        return;
      }

      const summary = await SoundfontInstrumentCache.getCacheSummary(currentBaseUrl);
      setSoundfontCacheSummary(summary);
      setSelectedCachedSoundfontInstrument((currentSelection) => {
        if (summary.instruments.length === 0) {
          return '';
        }
        if (currentSelection && summary.instruments.includes(currentSelection)) {
          return currentSelection;
        }
        return summary.instruments[0];
      });
    } catch (error) {
      console.error('Failed to check soundfont cache state:', error);
      setSoundfontCacheSummary({ instrumentCount: 0, instruments: [] });
      setSelectedCachedSoundfontInstrument('');
    } finally {
      setIsCheckingSoundfontCache(false);
    }
  }, [configManager]);

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setLanguage(((configManager.get('general.language') as LanguageSetting | undefined) ?? 'auto'));
      setUvr5ModelUrl(
        (configManager.get('general.uvr5_web_runtime.mdx_net_model_url') as string)
        || LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium].download.defaultUrl,
      );
      setHtdemucsModelUrl(
        (configManager.get('general.uvr5_web_runtime.htdemucs_4s_model_url') as string)
        || LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s].download.defaultUrl,
      );
      setSoundfontBaseUrl((configManager.get('general.soundfont.base_url') as string) || '');
      setSoundfontServerManaged(configManager.isSoundfontServerManaged());
    };

    loadConfig();
    void refreshUvr5ModelCacheState();
    void refreshSoundfontCacheState();
  }, [configManager, refreshSoundfontCacheState, refreshUvr5ModelCacheState]);

  // Debounced save function for text inputs
  const debouncedSave = useCallback((key: string, value: string) => {
    const timeoutId = setTimeout(async () => {
      try {
        await configManager.set(key, value);
        console.log(`Settings saved: ${key} = ${value}`);
      } catch (error) {
        console.error(`Failed to save setting ${key}:`, error);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [configManager]);

  const handleLanguageChange = async (value: LanguageSetting) => {
    setLanguage(value);
    try {
      await setLanguageSetting(value);
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const handleSoundfontBaseUrlChange = (value: string) => {
    setSoundfontBaseUrl(value);
    debouncedSave('general.soundfont.base_url', value);
  };

  const handleUvr5ModelUrlChange = (value: string) => {
    setUvr5ModelUrl(value);
    debouncedSave('general.uvr5_web_runtime.mdx_net_model_url', value);
  };

  const handleHtdemucsModelUrlChange = (value: string) => {
    setHtdemucsModelUrl(value);
    debouncedSave('general.uvr5_web_runtime.htdemucs_4s_model_url', value);
  };

  const handleDeleteUvr5Model = async () => {
    setIsDeletingUvr5Model(true);
    try {
      await LocalSeparatorModelCache.delete(LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium]);
      setIsUvr5ModelCached(false);
    } catch (error) {
      console.error('Failed to delete UVR5 cached model:', error);
    } finally {
      setIsDeletingUvr5Model(false);
      await refreshUvr5ModelCacheState();
    }
  };

  const handleDeleteHtdemucsModel = async () => {
    setIsDeletingHtdemucsModel(true);
    try {
      await LocalSeparatorModelCache.delete(LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s]);
      setIsHtdemucsModelCached(false);
    } catch (error) {
      console.error('Failed to delete HTDemucs cached model:', error);
    } finally {
      setIsDeletingHtdemucsModel(false);
      await refreshUvr5ModelCacheState();
    }
  };

  const handleDeleteSoundfontCache = async () => {
    setIsDeletingSoundfontCache(true);
    try {
      await SoundfontInstrumentCache.deleteAll();
      setSoundfontCacheSummary({ instrumentCount: 0, instruments: [] });
    } catch (error) {
      console.error('Failed to delete soundfont cache:', error);
    } finally {
      setIsDeletingSoundfontCache(false);
      await refreshSoundfontCacheState();
    }
  };

  const handleDeleteCachedSoundfontInstrument = async () => {
    if (!selectedCachedSoundfontInstrument) {
      return;
    }

    setIsDeletingCachedSoundfontInstrument(true);
    try {
      await SoundfontInstrumentCache.deleteInstrument(selectedCachedSoundfontInstrument);
    } catch (error) {
      console.error(`Failed to delete soundfont cache for ${selectedCachedSoundfontInstrument}:`, error);
    } finally {
      setIsDeletingCachedSoundfontInstrument(false);
      await refreshSoundfontCacheState();
    }
  };


  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.general.title')}</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <div className="settings-item">
            <label className="settings-label" htmlFor="general-language-select">
              {t('settings.general.language.label')}
            </label>
            <select
              id="general-language-select"
              className="settings-select"
              value={language}
              onChange={(e) => void handleLanguageChange(e.target.value as LanguageSetting)}
            >
              <option value="auto">{t('settings.general.language.auto')}</option>
              <option value="en_us">{LANGUAGE_OPTION_LABELS.en_us}</option>
              <option value="fr_fr">{LANGUAGE_OPTION_LABELS.fr_fr}</option>
              <option value="zh_cn">{LANGUAGE_OPTION_LABELS.zh_cn}</option>
              <option value="zh_hk">{LANGUAGE_OPTION_LABELS.zh_hk}</option>
            </select>
            <div className="settings-help">
              {t('settings.general.language.help')}
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.uvr5.section')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.uvr5.downloadUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={`e.g. ${LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium].download.defaultUrl}`}
              value={uvr5ModelUrl}
              onChange={(e) => handleUvr5ModelUrlChange(e.target.value)}
            />
            <div className="settings-help">
              {t('settings.general.modelUrl.help')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleUvr5ModelUrlChange(
                    LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium].download.defaultUrl,
                  );
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {t('settings.restoreDefault')}
              </a>
            </div>
          </div>

          <div className="settings-item" style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="settings-btn settings-btn-danger"
              onClick={() => void handleDeleteUvr5Model()}
              disabled={isCheckingUvr5ModelCache || isDeletingUvr5Model || !isUvr5ModelCached}
            >
              {isDeletingUvr5Model ? t('settings.deleting') : t('settings.deleteCachedModel')}
            </button>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.htdemucs.downloadUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={`e.g. ${LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s].download.defaultUrl}`}
              value={htdemucsModelUrl}
              onChange={(e) => handleHtdemucsModelUrlChange(e.target.value)}
            />
            <div className="settings-help">
              {t('settings.general.modelUrl.help')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleHtdemucsModelUrlChange(
                    LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s].download.defaultUrl,
                  );
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {t('settings.restoreDefault')}
              </a>
            </div>
          </div>

          <div className="settings-item" style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="settings-btn settings-btn-danger"
              onClick={() => void handleDeleteHtdemucsModel()}
              disabled={isCheckingUvr5ModelCache || isDeletingHtdemucsModel || !isHtdemucsModelCached}
            >
              {isDeletingHtdemucsModel ? t('settings.deleting') : t('settings.deleteCachedModel')}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.soundfont.section')}</h4>

          {soundfontServerManaged && (
            <div className="settings-help settings-help-note">
              {t('settings.general.soundfont.managed')}
            </div>
          )}

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.soundfont.baseUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/"
              value={soundfontBaseUrl}
              onChange={(e) => handleSoundfontBaseUrlChange(e.target.value)}
              disabled={soundfontServerManaged}
            />
            <div className="settings-help">
              {t('settings.general.soundfont.baseUrlHelp')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleSoundfontBaseUrlChange('https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {t('settings.restoreDefault')}
              </a>
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.soundfont.cachedStatus')}
            </label>
            <div className="settings-help">
              {isCheckingSoundfontCache
                ? t('settings.general.soundfont.cacheChecking')
                : soundfontCacheSummary.instrumentCount > 0
                  ? t('settings.general.soundfont.cacheReady', { count: soundfontCacheSummary.instrumentCount })
                  : t('settings.general.soundfont.cacheEmpty')}
            </div>
            <div className="settings-help">
              {t('settings.general.soundfont.cacheHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="soundfont-cached-instrument-select">
              {t('settings.general.soundfont.cachedInstrument')}
            </label>
            <select
              id="soundfont-cached-instrument-select"
              className="settings-select"
              value={selectedCachedSoundfontInstrument}
              onChange={(e) => setSelectedCachedSoundfontInstrument(e.target.value)}
              disabled={isCheckingSoundfontCache || soundfontCacheSummary.instrumentCount === 0 || isDeletingCachedSoundfontInstrument}
            >
              {soundfontCacheSummary.instrumentCount === 0 ? (
                <option value="">{t('settings.general.soundfont.noCachedInstrumentOption')}</option>
              ) : (
                soundfontCacheSummary.instruments.map((instrumentName) => (
                  <option key={instrumentName} value={instrumentName}>
                    {instrumentName}
                  </option>
                ))
              )}
            </select>
            <div className="settings-help">
              {t('settings.general.soundfont.cachedInstrumentHelp')}
            </div>
          </div>

          <div className="settings-item" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="settings-btn settings-btn-danger"
                onClick={() => void handleDeleteCachedSoundfontInstrument()}
                disabled={
                  isDeletingCachedSoundfontInstrument
                  || isCheckingSoundfontCache
                  || !selectedCachedSoundfontInstrument
                  || soundfontCacheSummary.instrumentCount === 0
                }
              >
                {isDeletingCachedSoundfontInstrument ? t('settings.deleting') : t('settings.general.soundfont.deleteSelectedCache')}
              </button>

              <button
                type="button"
                className="settings-btn settings-btn-danger"
                onClick={() => void handleDeleteSoundfontCache()}
                disabled={isDeletingSoundfontCache || isCheckingSoundfontCache || soundfontCacheSummary.instrumentCount === 0}
              >
                {isDeletingSoundfontCache ? t('settings.deleting') : t('settings.general.soundfont.deleteCache')}
              </button>
            </div>
          </div>
        </div>

        <AireSettings />
      </div>
    </div>
  );
};

export default GeneralSettings;
