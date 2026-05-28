import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';
import { LocalLLMModelManager, type LocalLLMModelState } from '../../../util/localLLMModelManager';
import { LocalSeparatorModelCache } from '../../../util/local-separator/modelCache';
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
import { LOCAL_SEPARATOR_DEFAULT_MODEL_URL } from '../../../util/local-separator/config';

const GeneralSettings: React.FC = () => {
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
  const [isUvr5ModelCached, setIsUvr5ModelCached] = useState<boolean>(false);
  const [isCheckingUvr5ModelCache, setIsCheckingUvr5ModelCache] = useState<boolean>(false);
  const [isDeletingUvr5Model, setIsDeletingUvr5Model] = useState<boolean>(false);

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
      setIsUvr5ModelCached(await LocalSeparatorModelCache.exists());
    } catch (error) {
      console.error('Failed to check UVR5 cached model state:', error);
      setIsUvr5ModelCached(false);
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

      setLlmProvider((configManager.get('general.llm_provider') as string) || LOCAL_LLM_PROVIDER_KEY);
      setOpenaiKey((configManager.get('general.openai.api_key') as string) || '');
      setOpenaiModel((configManager.get('general.openai.model') as string) || '');
      setOpenaiFlex((configManager.get('general.openai.flex') as boolean) ?? false);
      setPersistApiKeysNonLocalhost((configManager.get('general.persist_api_keys_non_localhost') as boolean) ?? false);
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
      setUvr5ModelUrl((configManager.get('general.uvr5_web_runtime.mdx_net_model_url') as string) || LOCAL_SEPARATOR_DEFAULT_MODEL_URL);
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
      await LocalSeparatorModelCache.delete();
      setIsUvr5ModelCached(false);
    } catch (error) {
      console.error('Failed to delete UVR5 cached model:', error);
    } finally {
      setIsDeletingUvr5Model(false);
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
        <h3>General</h3>
      </div>

      <div className="settings-section-content">
        <div className="settings-group">
          <h4>LLM Provider</h4>

          <div className="settings-item">
            <label className="settings-label">
              LLM Provider
            </label>
            <select
              className="settings-select"
              value={llmProvider}
              onChange={(e) => handleLlmProviderChange(e.target.value)}
            >
              <option value={LOCAL_LLM_PROVIDER_KEY}>Local LLM (Browser)</option>
              <option value="openai">OpenAI</option>
              {/* <option value="gemini">Gemini</option>
              <option value="claude">Claude</option> */}
              <option value="claude_openrouter">Claude (via OpenRouter)</option>
              <option value="openai_compatible">OpenAI Compatible (e.g. OpenRouter, Ollama)</option>
            </select>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Persist API Keys on Non-Localhost
            </label>
            <select
              className="settings-select"
              value={persistApiKeysNonLocalhost ? 'yes' : 'no'}
              onChange={(e) => handlePersistApiKeysNonLocalhostChange(e.target.value)}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              When enabled, API keys will be saved to browser storage even on non-localhost environments. Warning: This may increase security vulnerability to XSS attacks.
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
              Cached Model Status
            </label>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {localModelState.isChecking
                ? 'Checking local model cache...'
                : localModelState.isCached
                  ? 'Downloaded in browser cache.'
                  : 'Not downloaded yet.'}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label" htmlFor="local-llm-context-length">
              Context Length
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
              Larger context lengths require more VRAM and may also reduce performance as conversations become longer.
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Download URL
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={`e.g. ${LOCAL_LLM_DEFAULT_MODEL_URL}`}
              value={localModelUrl}
              onChange={(e) => handleLocalModelUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Changing this URL may break downloads or point to an incompatible model file.{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleLocalModelUrlChange(LOCAL_LLM_DEFAULT_MODEL_URL);
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Restore default
              </a>
            </div>
          </div>

          {!localModelState.isCached && !localModelState.isDownloading && localModelState.runtimeSupport.supported && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
              The local model downloads automatically the next time you chat with `Local LLM (Browser)`.
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
              {localModelState.isDeleting ? 'Deleting...' : 'Delete Cached Model'}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h4>UVR5 Web Runtime</h4>

          <div className="settings-item">
            <label className="settings-label">
              UVR-MDX-NET-Inst_HQ_3 Download URL
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder={`e.g. ${LOCAL_SEPARATOR_DEFAULT_MODEL_URL}`}
              value={uvr5ModelUrl}
              onChange={(e) => handleUvr5ModelUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Changing this URL may break downloads or point to an incompatible model file.{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleUvr5ModelUrlChange(LOCAL_SEPARATOR_DEFAULT_MODEL_URL);
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Restore default
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
              {isDeletingUvr5Model ? 'Deleting...' : 'Delete Cached Model'}
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h4>OpenAI</h4>

          <div className="settings-item">
            <label className="settings-label">
              Key
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your OpenAI API key"
              value={openaiKey}
              onChange={(e) => handleOpenaiKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? 'Keys are persisted locally (the IndexedDB in your browser).'
                : persistApiKeysNonLocalhost
                  ? 'Keys are persisted locally (the IndexedDB in your browser).'
                  : 'For security, keys are not persisted on non-local hosts and are kept in-memory for this session.'}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Model
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
              Flex Mode
            </label>
            <select
              className="settings-select"
              value={openaiFlex ? 'yes' : 'no'}
              onChange={(e) => handleOpenaiFlexChange(e.target.value)}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Flex Mode uses OpenAI's flexible service tier. Pros: potential cost savings and higher throughput during busy periods. Cons: variable latency and possible queueing/deprioritization. Applies only to the OpenAI provider; no effect for OpenAI Compatible servers.
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
          <h4>Anthropic Claude (via OpenRouter)</h4>

          <div className="settings-item">
            <label className="settings-label">
              Key
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your Claude API key"
              value={claudeOpenRouterKey}
              onChange={(e) => handleClaudeOpenRouterKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? 'Keys are persisted locally (the IndexedDB in your browser).'
                : persistApiKeysNonLocalhost
                  ? 'Keys are persisted locally (the IndexedDB in your browser).'
                  : 'For security, keys are not persisted on non-local hosts and are kept in-memory for this session.'}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Base URL
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. https://openrouter.ai/api/v1"
              value={claudeOpenRouterBaseUrl}
              onChange={(e) => handleClaudeOpenRouterBaseUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              This is the base URL for the OpenRouter API. Please do not change this unless you know what you are doing.
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Model
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
          <h4>OpenAI Compatible Server</h4>

          <div className="settings-item">
            <label className="settings-label">
              Key
            </label>
            <input
              type="password"
              className="settings-input"
              placeholder="Enter your API key"
              value={compatibleKey}
              onChange={(e) => handleCompatibleKeyChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              {isLocalEnvironment
                ? 'Keys are persisted locally (the IndexedDB in your browser).'
                : persistApiKeysNonLocalhost
                  ? 'Keys are persisted locally (the IndexedDB in your browser).'
                  : 'For security, keys are not persisted on non-local hosts and are kept in-memory for this session.'}
            </div>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Base URL
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. https://openrouter.ai/api/v1"
              value={compatibleBaseUrl}
              onChange={(e) => handleCompatibleBaseUrlChange(e.target.value)}
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Quick presets:{' '}
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
              Model
            </label>
            <input
              type="text"
              className="settings-input"
              placeholder="e.g. qwen3:30b"
              value={compatibleModel}
              onChange={(e) => handleCompatibleModelChange(e.target.value)}
            />
          </div>
        </div>

        <div className="settings-group">
          <h4>Soundfont Settings</h4>

          {soundfontServerManaged && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
              Soundfont configuration is managed by the server (kgone-server.json). Settings are read-only.
            </div>
          )}

          <div className="settings-item">
            <label className="settings-label">
              Base URL
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
              Changing this URL to an incompatible soundfont source may cause some instruments to sound wrong or not play.{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleSoundfontBaseUrlChange('https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/');
                }}
                style={{ color: '#5a9fd4', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Restore default
              </a>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h4>K.G.One Settings</h4>

          {kgoneServerManaged && (
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginBottom: '8px' }}>
              K.G.One configuration is managed by the server (kgone-server.json). Settings are read-only.
            </div>
          )}

          <div className="settings-item">
            <label className="settings-label">
              Enable K.G.One Integration
            </label>
            <select
              className="settings-select"
              value={kgoneEnabled ? 'true' : 'false'}
              onChange={(e) => handleKgoneEnabledChange(e.target.value === 'true')}
              disabled={kgoneServerManaged}
            >
              <option value="false">Disabled</option>
              <option value="true">Enabled</option>
            </select>
          </div>

          <div className="settings-item">
            <label className="settings-label">
              Server Base URL
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
              Base URL of a running K.G.One Music Studio server. Used for full-song generation, clip generation, and stem separation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
