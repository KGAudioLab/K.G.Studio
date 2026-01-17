import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfigManager } from '../../../core/config/ConfigManager';

const GeneralSettings: React.FC = () => {
  const [llmProvider, setLlmProvider] = useState<string>('openai');
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
  const [compatibleKey, setCompatibleKey] = useState<string>('');
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState<string>('');
  const [compatibleModel, setCompatibleModel] = useState<string>('');
  const [soundfontBaseUrl, setSoundfontBaseUrl] = useState<string>('');

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

      setLlmProvider((configManager.get('general.llm_provider') as string) || 'openai');
      setOpenaiKey((configManager.get('general.openai.api_key') as string) || '');
      setOpenaiModel((configManager.get('general.openai.model') as string) || '');
      setOpenaiFlex((configManager.get('general.openai.flex') as boolean) ?? false);
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
      setSoundfontBaseUrl((configManager.get('general.soundfont.base_url') as string) || '');
    };

    loadConfig();
  }, [configManager]);

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
              <option value="openai">OpenAI</option>
              {/* <option value="gemini">Gemini</option>
              <option value="claude">Claude</option> */}
              <option value="claude_openrouter">Claude (via OpenRouter)</option>
              <option value="openai_compatible">OpenAI Compatible (e.g. OpenRouter, Ollama)</option>
            </select>
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
              placeholder="e.g. https://openrouter.ai/api/v1/chat/completions"
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
              placeholder="e.g. https://openrouter.ai/api/v1/chat/completions"
              value={compatibleBaseUrl}
              onChange={(e) => handleCompatibleBaseUrlChange(e.target.value)}
            />
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
            />
            <div className="settings-help" style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
              Changing this URL to an incompatible soundfont source may cause some instruments to sound wrong or not play.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;