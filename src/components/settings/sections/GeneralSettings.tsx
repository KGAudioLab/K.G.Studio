import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { LocalLLMModelManager, type LocalLLMModelState } from '../../../util/localLLMModelManager';
import { LocalSeparatorModelCache } from '../../../util/local-separator/modelCache';
import { useI18n } from '../../../i18n/useI18n';
import type { LanguageSetting } from '../../../i18n/types';
import {
  formatLocalLLMContextLength,
  LOCAL_LLM_CONTEXT_LENGTH_OPTIONS,
  LOCAL_LLM_DEFAULT_MODEL_URL,
  LOCAL_LLM_DEFAULT_CONTEXT_LENGTH,
  LOCAL_LLM_DISPLAY_NAME,
  LOCAL_LLM_PROVIDER_KEY,
  normalizeLocalLLMContextLength,
  type LocalLLMContextLength,
} from '../../../util/localLLMConfig';
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
  const [llmProvider, setLlmProvider] = useState<string>(LOCAL_LLM_PROVIDER_KEY);
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>('');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [claudeKey, setClaudeKey] = useState<string>('');
  const [claudeModel, setClaudeModel] = useState<string>('');
  const [claudeOpenRouterKey, setClaudeOpenRouterKey] = useState<string>('');
  const [claudeOpenRouterBaseUrl, setClaudeOpenRouterBaseUrl] = useState<string>('');
  const [claudeOpenRouterModel, setClaudeOpenRouterModel] = useState<string>('');
  const [openaiFlex, setOpenaiFlex] = useState<boolean>(false);
  const [persistApiKeysNonLocalhost, setPersistApiKeysNonLocalhost] = useState<boolean>(false);
  const [autoCompactThresholdPercent, setAutoCompactThresholdPercent] = useState<80 | 90 | 95>(90);
  const [compatibleKey, setCompatibleKey] = useState<string>('');
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState<string>('');
  const [compatibleModel, setCompatibleModel] = useState<string>('');
  const [soundfontBaseUrl, setSoundfontBaseUrl] = useState<string>('');
  const [kgoneEnabled, setKgoneEnabled] = useState<boolean>(false);
  const [kgoneBaseUrl, setKgoneBaseUrl] = useState<string>('');
  const [kgoneServerManaged, setKgoneServerManaged] = useState<boolean>(false);
  const [soundfontServerManaged, setSoundfontServerManaged] = useState<boolean>(false);
  const [localContextLength, setLocalContextLength] = useState<LocalLLMContextLength>(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
  const [localModelState, setLocalModelState] = useState<LocalLLMModelState>(LocalLLMModelManager.getState());
  const [localModelUrl, setLocalModelUrl] = useState<string>('');
  const [uvr5ModelUrl, setUvr5ModelUrl] = useState<string>('');
  const [htdemucsModelUrl, setHtdemucsModelUrl] = useState<string>('');
  const [isUvr5ModelCached, setIsUvr5ModelCached] = useState<boolean>(false);
  const [isCheckingUvr5ModelCache, setIsCheckingUvr5ModelCache] = useState<boolean>(false);
  const [isDeletingUvr5Model, setIsDeletingUvr5Model] = useState<boolean>(false);
  const [isHtdemucsModelCached, setIsHtdemucsModelCached] = useState<boolean>(false);
  const [isDeletingHtdemucsModel, setIsDeletingHtdemucsModel] = useState<boolean>(false);

  const configManager = ConfigManager.instance();

  const isLocalEnvironment = useMemo(() => {
    try {
      if (typeof window === 'undefined' || typeof window.location === 'undefined') {
        return false;
      }
      const { protocol, hostname } = window.location;
      if (protocol === 'file:') return true;
      const localHosts = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
      return localHosts.has(hostname);
    } catch {
      return false;
    }
  }, []);

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

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setLanguage(((configManager.get('general.language') as LanguageSetting | undefined) ?? 'auto'));
      setLlmProvider((configManager.get('general.llm_provider') as string) || LOCAL_LLM_PROVIDER_KEY);
      setOpenaiKey((configManager.get('general.openai.api_key') as string) || '');
      setOpenaiModel((configManager.get('general.openai.model') as string) || '');
      setOpenaiFlex((configManager.get('general.openai.flex') as boolean) ?? false);
      setPersistApiKeysNonLocalhost((configManager.get('general.persist_api_keys_non_localhost') as boolean) ?? false);
      setAutoCompactThresholdPercent(
        ((configManager.get('general.auto_compact_threshold_percent') as 80 | 90 | 95 | undefined) ?? 90),
      );
      setGeminiKey((configManager.get('general.gemini.api_key') as string) || '');
      setGeminiModel((configManager.get('general.gemini.model') as string) || '');
      setClaudeKey((configManager.get('general.claude.api_key') as string) || '');
      setClaudeModel((configManager.get('general.claude.model') as string) || '');
      setClaudeOpenRouterKey((configManager.get('general.claude_openrouter.api_key') as string) || '');
      setClaudeOpenRouterBaseUrl((configManager.get('general.claude_openrouter.base_url') as string) || '');
      setClaudeOpenRouterModel((configManager.get('general.claude_openrouter.model') as string) || '');
      setCompatibleKey((configManager.get('general.openai_compatible.api_key') as string) || '');
      setCompatibleBaseUrl((configManager.get('general.openai_compatible.base_url') as string) || '');
      setCompatibleModel((configManager.get('general.openai_compatible.model') as string) || '');
      setLocalContextLength(normalizeLocalLLMContextLength(configManager.get('general.local_browser.context_length')));
      setLocalModelUrl((configManager.get('general.local_browser.model_url') as string) || LOCAL_LLM_DEFAULT_MODEL_URL);
      setUvr5ModelUrl(
        (configManager.get('general.uvr5_web_runtime.mdx_net_model_url') as string)
        || LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.mdxMedium].download.defaultUrl,
      );
      setHtdemucsModelUrl(
        (configManager.get('general.uvr5_web_runtime.htdemucs_4s_model_url') as string)
        || LOCAL_SEPARATOR_MODEL_CONFIGS[LOCAL_SEPARATOR_MODEL_IDS.htdemucs4s].download.defaultUrl,
      );
      setSoundfontBaseUrl((configManager.get('general.soundfont.base_url') as string) || '');
      setKgoneEnabled((configManager.get('general.kgone.enabled') as boolean) ?? false);
      setKgoneBaseUrl((configManager.get('general.kgone.base_url') as string) || '');
      setKgoneServerManaged(configManager.isKGOneServerManaged());
      setSoundfontServerManaged(configManager.isSoundfontServerManaged());
    };

    loadConfig();
    const unsubscribe = LocalLLMModelManager.subscribe(setLocalModelState);
    void refreshUvr5ModelCacheState();
    return unsubscribe;
  }, [configManager, refreshUvr5ModelCacheState]);

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

  // Save configuration when values change
  const handleLlmProviderChange = async (value: string) => {
    setLlmProvider(value);
    try {
      await configManager.set('general.llm_provider', value);
      console.log('LLM provider changed to:', value);
    } catch (error) {
      console.error('Failed to save LLM provider:', error);
    }
  };

  const handleLanguageChange = async (value: LanguageSetting) => {
    setLanguage(value);
    try {
      await setLanguageSetting(value);
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const handleOpenaiKeyChange = (value: string) => {
    setOpenaiKey(value);
    debouncedSave('general.openai.api_key', value);
  };

  const handleOpenaiModelChange = (value: string) => {
    setOpenaiModel(value);
    debouncedSave('general.openai.model', value);
  };

  const handleOpenaiFlexChange = async (value: string) => {
    const boolValue = value === 'yes';
    setOpenaiFlex(boolValue);
    try {
      await configManager.set('general.openai.flex', boolValue);
      console.log('OpenAI Flex Mode changed to:', boolValue);
    } catch (error) {
      console.error('Failed to save OpenAI Flex Mode:', error);
    }
  };

  const handlePersistApiKeysNonLocalhostChange = async (value: string) => {
    const boolValue = value === 'yes';
    setPersistApiKeysNonLocalhost(boolValue);
    try {
      await configManager.set('general.persist_api_keys_non_localhost', boolValue);
      console.log('Persist API Keys Non-Localhost changed to:', boolValue);
    } catch (error) {
      console.error('Failed to save Persist API Keys Non-Localhost:', error);
    }
  };

  const handleAutoCompactThresholdChange = async (value: string) => {
    const parsed = Number(value);
    const normalized: 80 | 90 | 95 = parsed === 80 || parsed === 95 ? parsed : 90;
    setAutoCompactThresholdPercent(normalized);
    try {
      await configManager.set('general.auto_compact_threshold_percent', normalized);
      console.log('Auto-compact threshold changed to:', normalized);
    } catch (error) {
      console.error('Failed to save auto-compact threshold:', error);
    }
  };

  const handleGeminiKeyChange = (value: string) => {
    setGeminiKey(value);
    debouncedSave('general.gemini.api_key', value);
  };

  const handleGeminiModelChange = (value: string) => {
    setGeminiModel(value);
    debouncedSave('general.gemini.model', value);
  };

  const handleClaudeKeyChange = (value: string) => {
    setClaudeKey(value);
    debouncedSave('general.claude.api_key', value);
  };

  const handleClaudeModelChange = (value: string) => {
    setClaudeModel(value);
    debouncedSave('general.claude.model', value);
  };

  const handleClaudeOpenRouterKeyChange = (value: string) => {
    setClaudeOpenRouterKey(value);
    debouncedSave('general.claude_openrouter.api_key', value);
  };

  const handleClaudeOpenRouterModelChange = (value: string) => {
    setClaudeOpenRouterModel(value);
    debouncedSave('general.claude_openrouter.model', value);
  };

  const handleClaudeOpenRouterBaseUrlChange = (value: string) => {
    setClaudeOpenRouterBaseUrl(value);
    debouncedSave('general.claude_openrouter.base_url', value);
  };

  const handleCompatibleKeyChange = (value: string) => {
    setCompatibleKey(value);
    debouncedSave('general.openai_compatible.api_key', value);
  };

  const handleCompatibleBaseUrlChange = (value: string) => {
    setCompatibleBaseUrl(value);
    debouncedSave('general.openai_compatible.base_url', value);
  };

  const handleCompatibleModelChange = (value: string) => {
    setCompatibleModel(value);
    debouncedSave('general.openai_compatible.model', value);
  };

  const handleSoundfontBaseUrlChange = (value: string) => {
    setSoundfontBaseUrl(value);
    debouncedSave('general.soundfont.base_url', value);
  };

  const handleKgoneEnabledChange = async (value: boolean) => {
    setKgoneEnabled(value);
    try {
      await configManager.set('general.kgone.enabled', value);
    } catch (error) {
      console.error('Failed to save K.G.One enabled:', error);
    }
  };

  const handleKgoneBaseUrlChange = (value: string) => {
    setKgoneBaseUrl(value);
    debouncedSave('general.kgone.base_url', value);
  };

  const handleLocalModelUrlChange = (value: string) => {
    setLocalModelUrl(value);
    debouncedSave('general.local_browser.model_url', value);
  };

  const handleUvr5ModelUrlChange = (value: string) => {
    setUvr5ModelUrl(value);
    debouncedSave('general.uvr5_web_runtime.mdx_net_model_url', value);
  };

  const handleHtdemucsModelUrlChange = (value: string) => {
    setHtdemucsModelUrl(value);
    debouncedSave('general.uvr5_web_runtime.htdemucs_4s_model_url', value);
  };

  const handleDeleteLocalModel = async () => {
    try {
      await LocalLLMModelManager.deleteCachedModel();
    } catch (error) {
      console.error('Failed to delete local language model cache:', error);
    }
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

  const handleLocalContextLengthChange = async (value: string) => {
    const parsed = Number(value);
    const normalized = normalizeLocalLLMContextLength(parsed);
    setLocalContextLength(normalized);
    try {
      await configManager.set('general.local_browser.context_length', normalized);
      console.log('Local browser context length changed to:', normalized);
    } catch (error) {
      console.error('Failed to save local browser context length:', error);
    }
  };

  const localRuntimeMessage = localModelState.runtimeSupport.reason;
  const hasLocalRuntimeHardFailure = !localModelState.runtimeSupport.supported;

  // NOTE: Gemini and Claude are not supported yet due to CORS issues.
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
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.language.help')}
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.llmProvider.section')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.llmProvider.label')}
            </label>
            <select
              className="settings-select"
              value={llmProvider}
              onChange={(e) => handleLlmProviderChange(e.target.value)}
            >
              <option value={LOCAL_LLM_PROVIDER_KEY}>{t('settings.general.llmProvider.local')}</option>
              <option value="openai">{t('settings.general.llmProvider.openai')}</option>
              {/* <option value="gemini">Gemini</option>
              <option value="claude">Claude</option> */}
              <option value="claude_openrouter">{t('settings.general.llmProvider.claudeOpenRouter')}</option>
              <option value="openai_compatible">{t('settings.general.llmProvider.openaiCompatible')}</option>
            </select>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.persistKeys.label')}
            </label>
            <select
              className="settings-select"
              value={persistApiKeysNonLocalhost ? 'yes' : 'no'}
              onChange={(e) => handlePersistApiKeysNonLocalhostChange(e.target.value)}
            >
              <option value="no">{t('settings.no')}</option>
              <option value="yes">{t('settings.yes')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.persistKeys.help')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="general-auto-compact-threshold">
              Auto-Compact Threshold
            </label>
            <select
              id="general-auto-compact-threshold"
              className="settings-select"
              value={autoCompactThresholdPercent}
              onChange={(e) => void handleAutoCompactThresholdChange(e.target.value)}
            >
              <option value="95">Conservative (95%)</option>
              <option value="90">Standard (90%)</option>
              <option value="80">Early (80%)</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Compact the conversation before the next request when estimated context usage reaches this level.
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4>{LOCAL_LLM_DISPLAY_NAME} Local Runtime</h4>

          {hasLocalRuntimeHardFailure && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#d45a5a', marginTop: '4px', marginBottom: '8px' }}>
              {localRuntimeMessage}
            </div>
          )}

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.localRuntime.cachedStatus')}
            </label>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {localModelState.isChecking
                ? t('settings.general.localRuntime.cacheChecking')
                : localModelState.isCached
                  ? t('settings.general.localRuntime.cacheDownloaded')
                  : t('settings.general.localRuntime.cacheMissing')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="local-llm-context-length">
              {t('settings.general.localRuntime.contextLength')}
            </label>
            <select
              id="local-llm-context-length"
              className="settings-select"
              value={localContextLength}
              onChange={(e) => void handleLocalContextLengthChange(e.target.value)}
            >
              {LOCAL_LLM_CONTEXT_LENGTH_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {formatLocalLLMContextLength(option)}
                </option>
              ))}
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.localRuntime.contextHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.localRuntime.downloadUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={`e.g. ${LOCAL_LLM_DEFAULT_MODEL_URL}`}
              value={localModelUrl}
              onChange={(e) => handleLocalModelUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.localRuntime.downloadHelp')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleLocalModelUrlChange(LOCAL_LLM_DEFAULT_MODEL_URL);
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                {t('settings.restoreDefault')}
              </a>
            </div>
          </div>

          {!localModelState.isCached && !localModelState.isDownloading && localModelState.runtimeSupport.supported && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
              {t('settings.general.localRuntime.autoDownload')}
            </div>
          )}

          {(localModelState.isDownloading || localModelState.progressText) && (
            <div className="settings-progress-block">
              <div
                className="settings-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, localModelState.progressPercent))}
              >
                <div className="settings-progress-fill" style={{ width: `${Math.max(0, Math.min(100, localModelState.progressPercent))}%` }} />
              </div>
              <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                {localModelState.progressText}
              </div>
            </div>
          )}

          {localModelState.error && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#d45a5a', marginTop: '8px' }}>
              {localModelState.error}
            </div>
          )}

          <div className="settings-item" style={{ marginTop: '12px' }}>
            <button
              type="button"
              className="settings-btn settings-btn-danger"
              onClick={() => void handleDeleteLocalModel()}
              disabled={localModelState.isDeleting || localModelState.isDownloading || !localModelState.isCached}
            >
              {localModelState.isDeleting ? t('settings.deleting') : t('settings.deleteCachedModel')}
            </button>
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
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
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
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
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
          <h4>{t('settings.general.openai.section')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.key')}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder={t('settings.general.openai.keyPlaceholder')}
              value={openaiKey}
              onChange={(e) => handleOpenaiKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? t('settings.general.keys.persisted')
                : persistApiKeysNonLocalhost
                  ? t('settings.general.keys.persisted')
                  : t('settings.general.keys.sessionOnly')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.model')}
            </label>
            <select
              className="settings-select"
              value={openaiModel}
              onChange={(e) => handleOpenaiModelChange(e.target.value)}
            >
              <option value="gpt-5.4">gpt-5.4</option>
              <option value="gpt-5.4-mini">gpt-5.4-mini</option>
              <option value="gpt-5.4-nano">gpt-5.4-nano</option>
              <option value="gpt-5.2">gpt-5.2</option>
              <option value="gpt-5-mini">gpt-5-mini</option>
              <option value="gpt-5-nano">gpt-5-nano</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.flexMode')}
            </label>
            <select
              className="settings-select"
              value={openaiFlex ? 'yes' : 'no'}
              onChange={(e) => handleOpenaiFlexChange(e.target.value)}
            >
              <option value="no">{t('settings.no')}</option>
              <option value="yes">{t('settings.yes')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.openai.flexHelp')}
            </div>
          </div>
        </div>

        {/* <div className="settings-group">
          <h4>Gemini</h4>
          
          <div className="settings-item">
            <label className="settings-label">
              Key
            </label>
            <input 
              type="password" 
              className="settings-input"
              placeholder="Enter your Gemini API key"
              value={geminiKey}
              onChange={(e) => handleGeminiKeyChange(e.target.value)}
            />
          </div>
          
          <div className="settings-item">
            <label className="settings-label">
              Model
            </label>
            <input 
              type="text" 
              className="settings-input"
              placeholder="e.g. gemini-2.5-flash"
              value={geminiModel}
              onChange={(e) => handleGeminiModelChange(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-group">
          <h4>Claude</h4>
          
          <div className="settings-item">
            <label className="settings-label">
              Key
            </label>
            <input 
              type="password" 
              className="settings-input"
              placeholder="Enter your Claude API key"
              value={claudeKey}
              onChange={(e) => handleClaudeKeyChange(e.target.value)}
            />
          </div>
          
          <div className="settings-item">
            <label className="settings-label">
              Model
            </label>
            <input 
              type="text" 
              className="settings-input"
              placeholder="e.g. claude-sonnet-4-0"
              value={claudeModel}
              onChange={(e) => handleClaudeModelChange(e.target.value)}
            />
          </div>
        </div> */}

        <div className="settings-group">
          <h4>{t('settings.general.claudeOpenRouter.section')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.key')}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder={t('settings.general.claudeOpenRouter.keyPlaceholder')}
              value={claudeOpenRouterKey}
              onChange={(e) => handleClaudeOpenRouterKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? t('settings.general.keys.persisted')
                : persistApiKeysNonLocalhost
                  ? t('settings.general.keys.persisted')
                  : t('settings.general.keys.sessionOnly')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.baseUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. https://openrouter.ai/api/v1"
              value={claudeOpenRouterBaseUrl}
              onChange={(e) => handleClaudeOpenRouterBaseUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.claudeOpenRouter.baseUrlHelp')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.model')}
            </label>
            <select
              className="settings-select"
              value={claudeOpenRouterModel}
              onChange={(e) => handleClaudeOpenRouterModelChange(e.target.value)}
            >
              <option value="anthropic/claude-sonnet-4.6">claude-sonnet-4.6</option>
              <option value="anthropic/claude-opus-4.6">claude-opus-4.6</option>
              <option value="anthropic/claude-sonnet-4.5">claude-sonnet-4.5</option>
              <option value="anthropic/claude-opus-4.5">claude-opus-4.5</option>
              <option value="anthropic/claude-sonnet-4">claude-sonnet-4</option>
              <option value="anthropic/claude-opus-4.1">claude-opus-4.1</option>
            </select>
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.openaiCompatible.section')}</h4>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.key')}
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder={t('settings.general.openaiCompatible.keyPlaceholder')}
              value={compatibleKey}
              onChange={(e) => handleCompatibleKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? t('settings.general.keys.persisted')
                : persistApiKeysNonLocalhost
                  ? t('settings.general.keys.persisted')
                  : t('settings.general.keys.sessionOnly')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.baseUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={t('settings.general.openaiCompatible.baseUrlPlaceholder')}
              value={compatibleBaseUrl}
              onChange={(e) => handleCompatibleBaseUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.openaiCompatible.baseUrlHelp')}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleCompatibleBaseUrlChange('http://localhost:11434/v1/chat/completions');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Ollama
              </a>
              {' | '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleCompatibleBaseUrlChange('http://localhost:8080/v1/chat/completions');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                llama.cpp
              </a>
              {' | '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleCompatibleBaseUrlChange('http://127.0.0.1:8317/v1/chat/completions');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                CLIProxyAPI
              </a>
              {' | '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleCompatibleBaseUrlChange('https://openrouter.ai/api/v1/chat/completions');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                OpenRouter
              </a>
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.openai.model')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={t('settings.general.openaiCompatible.modelPlaceholder')}
              value={compatibleModel}
              onChange={(e) => handleCompatibleModelChange(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.soundfont.section')}</h4>

          {soundfontServerManaged && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
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
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
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
        </div>

        <div className="settings-group">
          <h4>{t('settings.general.kgone.section')}</h4>

          {kgoneServerManaged && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
              {t('settings.general.kgone.managed')}
            </div>
          )}

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.kgone.enabled')}
            </label>
            <select
              className="settings-select"
              value={kgoneEnabled ? 'true' : 'false'}
              onChange={(e) => handleKgoneEnabledChange(e.target.value === 'true')}
              disabled={kgoneServerManaged}
            >
              <option value="false">{t('settings.general.kgone.disabled')}</option>
              <option value="true">{t('settings.general.kgone.enabledOption')}</option>
            </select>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              {t('settings.general.kgone.serverBaseUrl')}
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. http://127.0.0.1:8000"
              value={kgoneBaseUrl}
              onChange={(e) => handleKgoneBaseUrlChange(e.target.value)}
              disabled={kgoneServerManaged}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.kgone.serverBaseUrlHelp')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
