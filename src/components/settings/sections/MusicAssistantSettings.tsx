import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { LocalLLMModelManager, type LocalLLMModelState } from '../../../util/localLLMModelManager';
import { useI18n } from '../../../i18n/useI18n';
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
  DEFAULT_AGENT_MODE,
  getEffectiveAgentMode,
  isAgentModeForcedByProvider,
  normalizeAgentMode,
  type AgentMode,
} from '../../../util/agentMode';

const LLM_CONNECTION_PRESETS = [
  { name: 'OpenAI', base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-6.1-sol' },
  { name: 'Claude (via OpenRouter)', base_url: 'https://openrouter.ai/api/v1', api_key: '', model: 'anthropic/claude-sonnet-5.5' },
  { name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', api_key: '', model: '' },
  { name: 'Ollama', base_url: 'http://localhost:11434/v1', api_key: '', model: '' },
  { name: 'llama.cpp', base_url: 'http://localhost:8080/v1', api_key: '', model: '' },
  { name: 'CLIProxyAPI', base_url: 'http://127.0.0.1:8317/v1', api_key: '', model: '' },
] as const;

// Keep pending edits reachable when the settings tab unmounts and remounts.
const pendingCompatibleSaves = new Map<string, ReturnType<typeof setTimeout>>();

const MusicAssistantSettings: React.FC = () => {
  const { t } = useI18n();
  const [agentMode, setAgentMode] = useState<AgentMode>(DEFAULT_AGENT_MODE);
  const [llmProvider, setLlmProvider] = useState<string>(LOCAL_LLM_PROVIDER_KEY);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [geminiModel, setGeminiModel] = useState<string>('');
  const [claudeKey, setClaudeKey] = useState<string>('');
  const [claudeModel, setClaudeModel] = useState<string>('');
  const [persistApiKeysNonLocalhost, setPersistApiKeysNonLocalhost] = useState<boolean>(false);
  const [autoCompactThresholdPercent, setAutoCompactThresholdPercent] = useState<80 | 90 | 95>(90);
  const [compatibleKey, setCompatibleKey] = useState<string>('');
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState<string>('');
  const [compatibleModel, setCompatibleModel] = useState<string>('');
  const [thinkingLevel, setThinkingLevel] = useState<string>('medium');
  const [localContextLength, setLocalContextLength] = useState<LocalLLMContextLength>(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
  const [localModelState, setLocalModelState] = useState<LocalLLMModelState>(LocalLLMModelManager.getState());
  const [localModelUrl, setLocalModelUrl] = useState<string>('');
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

  // Load configuration values on component mount
  useEffect(() => {
    const loadConfig = async () => {
      if (!configManager.getIsInitialized()) {
        await configManager.initialize();
      }

      setAgentMode(normalizeAgentMode(configManager.get('general.agent_mode')));
      setLlmProvider((configManager.get('general.llm_provider') as string) || LOCAL_LLM_PROVIDER_KEY);
      setPersistApiKeysNonLocalhost((configManager.get('general.persist_api_keys_non_localhost') as boolean) ?? false);
      setAutoCompactThresholdPercent(
        ((configManager.get('general.auto_compact_threshold_percent') as 80 | 90 | 95 | undefined) ?? 90),
      );
      setGeminiKey((configManager.get('general.gemini.api_key') as string) || '');
      setGeminiModel((configManager.get('general.gemini.model') as string) || '');
      setClaudeKey((configManager.get('general.claude.api_key') as string) || '');
      setClaudeModel((configManager.get('general.claude.model') as string) || '');
      setCompatibleKey((configManager.get('general.openai_compatible.api_key') as string) || '');
      setCompatibleBaseUrl((configManager.get('general.openai_compatible.base_url') as string) || '');
      setCompatibleModel((configManager.get('general.openai_compatible.model') as string) || '');
      setThinkingLevel((configManager.get('general.openai_compatible.reasoning_effort') as string | undefined) ?? 'medium');
      setLocalContextLength(normalizeLocalLLMContextLength(configManager.get('general.local_browser.context_length')));
      setLocalModelUrl((configManager.get('general.local_browser.model_url') as string) || LOCAL_LLM_DEFAULT_MODEL_URL);
    };

    loadConfig();
    return LocalLLMModelManager.subscribe(setLocalModelState);
  }, [configManager]);

  // Debounced save function for text inputs
  const debouncedSave = useCallback((key: string, value: string) => {
    if (key.startsWith('general.openai_compatible.')) {
      clearTimeout(pendingCompatibleSaves.get(key));
    }
    const timeoutId = setTimeout(async () => {
      pendingCompatibleSaves.delete(key);
      try {
        await configManager.set(key, value);
        console.log(`Settings saved: ${key} = ${value}`);
      } catch (error) {
        console.error(`Failed to save setting ${key}:`, error);
      }
    }, 500); // 500ms debounce

    if (key.startsWith('general.openai_compatible.')) {
      pendingCompatibleSaves.set(key, timeoutId);
    }
    return () => clearTimeout(timeoutId);
  }, [configManager]);

  const handleLlmProviderChange = async (value: string) => {
    setLlmProvider(value);
    try {
      await configManager.set('general.llm_provider', value);
      console.log('LLM provider changed to:', value);
    } catch (error) {
      console.error('Failed to save LLM provider:', error);
    }
  };

  const handleAgentModeChange = async (value: AgentMode) => {
    setAgentMode(value);
    try {
      await configManager.set('general.agent_mode', value);
      console.log('Agent mode changed to:', value);
    } catch (error) {
      console.error('Failed to save agent mode:', error);
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

  const handleCompatiblePreset = async (preset: typeof LLM_CONNECTION_PRESETS[number]) => {
    for (const timeout of pendingCompatibleSaves.values()) clearTimeout(timeout);
    pendingCompatibleSaves.clear();
    setCompatibleKey(preset.api_key);
    setCompatibleBaseUrl(preset.base_url);
    setCompatibleModel(preset.model);
    setLlmProvider('openai_compatible');
    try {
      await configManager.update({
        general: {
          ...configManager.getAll().general,
          llm_provider: 'openai_compatible',
          openai_compatible: {
            api_key: preset.api_key,
            base_url: preset.base_url,
            model: preset.model,
            reasoning_effort: thinkingLevel,
          },
        },
      });
    } catch (error) {
      console.error('Failed to apply LLM connection preset:', error);
    }
  };

  const handleLocalModelUrlChange = (value: string) => {
    setLocalModelUrl(value);
    debouncedSave('general.local_browser.model_url', value);
  };

  const handleDeleteLocalModel = async () => {
    try {
      await LocalLLMModelManager.deleteCachedModel();
    } catch (error) {
      console.error('Failed to delete local language model cache:', error);
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
  const isAgentModeOverriddenByLocalProvider = isAgentModeForcedByProvider(llmProvider);
  const effectiveAgentMode = getEffectiveAgentMode(configManager);

  // NOTE: Gemini and Claude are not supported yet due to CORS issues.
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h3>{t('settings.musicAssistant.title')}</h3>
      </div>

      <div className="settings-section-content">
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
              {/* <option value="gemini">Gemini</option>
              <option value="claude">Claude</option> */}
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
              {t('settings.general.autoCompactThreshold.label')}
            </label>
            <select
              id="general-auto-compact-threshold"
              className="settings-select"
              value={autoCompactThresholdPercent}
              onChange={(e) => void handleAutoCompactThresholdChange(e.target.value)}
            >
              <option value="95">{t('settings.general.autoCompactThreshold.conservative')}</option>
              <option value="90">{t('settings.general.autoCompactThreshold.standard')}</option>
              <option value="80">{t('settings.general.autoCompactThreshold.early')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {t('settings.general.autoCompactThreshold.help')}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="general-agent-mode-select">
              {t('settings.general.musicAssistant.agentMode.label')}
            </label>
            <select
              id="general-agent-mode-select"
              className="settings-select"
              value={agentMode}
              onChange={(e) => void handleAgentModeChange(e.target.value as AgentMode)}
              disabled={isAgentModeOverriddenByLocalProvider}
            >
              <option value="advanced">{t('settings.general.musicAssistant.agentMode.advanced')}</option>
              <option value="regular">{t('settings.general.musicAssistant.agentMode.regular')}</option>
              <option value="efficient">{t('settings.general.musicAssistant.agentMode.efficient')}</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isAgentModeOverriddenByLocalProvider
                ? t('settings.general.musicAssistant.agentMode.localOverride')
                : t('settings.general.musicAssistant.agentMode.help')}
            </div>
            {effectiveAgentMode !== agentMode && (
              <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                {t('settings.general.musicAssistant.agentMode.effectiveValue', {
                  mode: t('settings.general.musicAssistant.agentMode.efficient'),
                })}
              </div>
            )}
          </div>
        </div>

        {llmProvider === LOCAL_LLM_PROVIDER_KEY && (
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
        )}

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

        {llmProvider === 'openai_compatible' && (
          <div className="settings-group">
            <h4>{t('settings.general.openaiCompatible.section')}</h4>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
              {t('settings.general.openaiCompatible.helpIntro')}{' '}
              {t('settings.general.openaiCompatible.helpSubscriptionBefore')}{' '}
              <a href="https://github.com/router-for-me/CLIProxyAPI" target="_blank" rel="noopener noreferrer" style={{ color: '#5a9fd4', textDecoration: 'underline' }}>CLIProxyAPI</a>{' '}
              {t('settings.general.openaiCompatible.helpSubscriptionAfter')}
            </div>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
              {t('settings.general.openaiCompatible.presets')}{' '}
              {LLM_CONNECTION_PRESETS.map((preset, index) => (
                <React.Fragment key={preset.name}>
                  {index > 0 && ' | '}
                  <a href="#" style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }} onClick={(event) => {
                    event.preventDefault();
                    void handleCompatiblePreset(preset);
                  }}>
                    {preset.name === 'Claude (via OpenRouter)' ? t('settings.general.llmProvider.claudeOpenRouter') : preset.name}
                  </a>
                </React.Fragment>
              ))}
            </div>


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

            <div className="settings-item">
              <label className="settings-label" htmlFor="llm-thinking-level">
                {t('settings.general.openaiCompatible.thinkingLevel')}
              </label>
              <input
                id="llm-thinking-level"
                type="text"
                className="settings-input"
                placeholder="medium"
                value={thinkingLevel}
                onChange={(e) => {
                  setThinkingLevel(e.target.value);
                  debouncedSave('general.openai_compatible.reasoning_effort', e.target.value);
                }}
              />
              <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                {t('settings.general.openaiCompatible.thinkingLevelHelp')}
              </div>
              <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                {t('settings.general.openaiCompatible.thinkingLevelPresets')}{' '}
                {['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((level, index) => (
                  <React.Fragment key={level}>
                    {index > 0 && ' | '}
                    <a href="#" style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }} onClick={(event) => {
                      event.preventDefault();
                      setThinkingLevel(level);
                      debouncedSave('general.openai_compatible.reasoning_effort', level);
                    }}>
                      {level}
                    </a>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MusicAssistantSettings;
