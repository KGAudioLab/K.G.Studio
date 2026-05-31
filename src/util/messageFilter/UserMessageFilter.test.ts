import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processUserMessage } from './UserMessageFilter';
import { addWelcomeMessage } from '../../utils/chatMessageUtils';

const { detectLocalLLMRuntimeSupportMock } = vi.hoisted(() => ({
  detectLocalLLMRuntimeSupportMock: vi.fn(),
}));

const configState = new Map<string, unknown>();
const storeState = {
  setStatus: vi.fn(),
  activeRegionId: null as string | null,
  selectedRegionIds: [] as string[],
};

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
};

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

vi.mock('../chatUtil', () => ({
  clearChatHistoryAndUI: vi.fn(),
}));

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => storeState,
  },
}));

vi.mock('../../agent/core/SystemPrompts', () => ({
  SystemPrompts: {
    getPromptWithContext: vi.fn(async (value: string) => value),
  },
}));

vi.mock('../localLLMConfig', async () => {
  const actual = await vi.importActual<typeof import('../localLLMConfig')>('../localLLMConfig');
  return {
    ...actual,
    detectLocalLLMRuntimeSupport: detectLocalLLMRuntimeSupportMock,
  };
});

describe('processUserMessage slash commands', () => {
  beforeEach(() => {
    configState.clear();
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.openai.api_key', '');
    configState.set('general.gemini.api_key', '');
    configState.set('general.claude.api_key', '');
    configState.set('general.claude_openrouter.api_key', '');
    configState.set('general.openai_compatible.base_url', '');
    configState.set('general.openai_compatible.model', '');
    configState.set('general.language', 'en_us');

    configManagerMock.getIsInitialized.mockReturnValue(true);
    configManagerMock.initialize.mockClear();
    configManagerMock.get.mockClear();
    storeState.setStatus.mockClear();
    storeState.activeRegionId = null;
    storeState.selectedRegionIds = [];
    detectLocalLLMRuntimeSupportMock.mockReset();
    detectLocalLLMRuntimeSupportMock.mockReturnValue({
      supported: true,
      webgpuExposed: true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      secureContext: true,
      reason: null,
    });

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return {
        ok: true,
        status: 200,
        text: async () => `content:${url}`,
      };
    }));
  });

  it('uses the local welcome for the local browser provider', async () => {
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.openai.api_key', '');
    configState.set('general.openai_compatible.base_url', '');
    configState.set('general.openai_compatible.model', '');

    const result = await processUserMessage('/welcome');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm.md'));
    expect(result.metadata).toMatchObject({ command: 'welcome', variant: 'local' });
    expect(result.pseudoAssistantResponse).toContain('welcome_local_llm.md');
  });

  it('uses the localized welcome asset when zh-CN is selected', async () => {
    configState.set('general.language', 'zh_cn');
    configState.set('general.llm_provider', 'local_browser');

    const result = await processUserMessage('/welcome');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm-zh_cn.md'));
    expect(result.metadata).toMatchObject({ command: 'welcome', variant: 'local' });
    expect(result.pseudoAssistantResponse).toContain('welcome_local_llm-zh_cn.md');
  });

  it('uses the localized welcome asset when fr-FR is selected', async () => {
    configState.set('general.language', 'fr_fr');
    configState.set('general.llm_provider', 'local_browser');

    const result = await processUserMessage('/welcome');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm-fr_fr.md'));
    expect(result.metadata).toMatchObject({ command: 'welcome', variant: 'local' });
    expect(result.pseudoAssistantResponse).toContain('welcome_local_llm-fr_fr.md');
  });

  it('falls back to a localized welcome string when welcome markdown fetch fails', async () => {
    configState.set('general.language', 'zh_cn');
    configState.set('general.llm_provider', 'local_browser');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    const result = await processUserMessage('/welcome');

    expect(result.metadata).toMatchObject({ command: 'welcome' });
    expect(result.pseudoAssistantResponse).toBe('欢迎使用 K.G.Studio 音乐创作助手。');
  });

  it('uses the new-user welcome for non-local providers without required config', async () => {
    configState.set('general.llm_provider', 'openai');
    configState.set('general.openai.api_key', '');

    const result = await processUserMessage('/welcome');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_new.md'));
    expect(result.metadata).toMatchObject({ command: 'welcome', variant: 'new' });
    expect(result.pseudoAssistantResponse).toContain('welcome_new.md');
  });

  it('uses the returning-user welcome for configured non-local providers', async () => {
    configState.set('general.llm_provider', 'openai_compatible');
    configState.set('general.openai_compatible.base_url', 'https://openrouter.ai/api/v1');
    configState.set('general.openai_compatible.model', 'qwen/qwen3-30b-a3b:free');

    const result = await processUserMessage('/welcome');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_again.md'));
    expect(result.metadata).toMatchObject({ command: 'welcome', variant: 'again' });
    expect(result.pseudoAssistantResponse).toContain('welcome_again.md');
  });

  it('reuses the same welcome routing through addWelcomeMessage', async () => {
    configState.set('general.llm_provider', 'local_browser');

    const message = await addWelcomeMessage();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm.md'));
    expect(message?.role).toBe('assistant');
    expect(message?.content).toContain('welcome_local_llm.md');
  });

  it('uses localized welcome assets for addWelcomeMessage under auto + Chinese locale', async () => {
    configState.set('general.language', 'auto');
    vi.stubGlobal('navigator', {
      languages: ['zh-CN', 'en-US'],
      language: 'zh-CN',
    });

    const message = await addWelcomeMessage();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm-zh_cn.md'));
    expect(message?.content).toContain('welcome_local_llm-zh_cn.md');
  });

  it('uses localized welcome assets for addWelcomeMessage under auto + French locale', async () => {
    configState.set('general.language', 'auto');
    vi.stubGlobal('navigator', {
      languages: ['fr-FR', 'en-US'],
      language: 'fr-FR',
    });

    const message = await addWelcomeMessage();

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/welcome_local_llm-fr_fr.md'));
    expect(message?.content).toContain('welcome_local_llm-fr_fr.md');
  });

  it('fetches the localized help guide for /help under zh-CN', async () => {
    configState.set('general.language', 'zh_cn');

    const result = await processUserMessage('/help');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/help-zh_cn.md'));
    expect(result).toMatchObject({
      displayUserMessage: false,
      sendToLLM: false,
      finalMessageForLLM: null,
      metadata: { command: 'help' },
    });
    expect(result.pseudoAssistantResponse).toContain('chat/help-zh_cn.md');
  });

  it('fetches the localized help guide for /help under fr-FR', async () => {
    configState.set('general.language', 'fr_fr');

    const result = await processUserMessage('/help');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/help-fr_fr.md'));
    expect(result.pseudoAssistantResponse).toContain('chat/help-fr_fr.md');
  });

  it('falls back to the English help guide when the localized file is missing', async () => {
    configState.set('general.language', 'zh_cn');
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('chat/help-zh_cn.md')) {
        return {
          ok: false,
          status: 404,
          text: async () => '',
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => `content:${url}`,
      };
    }));

    const result = await processUserMessage('/help');

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('chat/help-zh_cn.md'));
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('chat/help.md'));
    expect(result.pseudoAssistantResponse).toContain('chat/help.md');
  });

  it('fetches the hotkeys guide for /hotkeys', async () => {
    const result = await processUserMessage('/hotkeys');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/hotkeys.md'));
    expect(result).toMatchObject({
      displayUserMessage: false,
      sendToLLM: false,
      finalMessageForLLM: null,
      metadata: { command: 'hotkeys' },
    });
    expect(result.pseudoAssistantResponse).toContain('chat/hotkeys.md');
  });

  it('fetches the localized hotkeys guide for /hotkeys under fr-FR', async () => {
    configState.set('general.language', 'fr_fr');

    const result = await processUserMessage('/hotkeys');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/hotkeys-fr_fr.md'));
    expect(result.pseudoAssistantResponse).toContain('chat/hotkeys-fr_fr.md');
  });

  it('fetches the localized hotkeys guide for /hotkeys under zh-CN', async () => {
    configState.set('general.language', 'zh_cn');

    const result = await processUserMessage('/hotkeys');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/hotkeys-zh_cn.md'));
    expect(result.pseudoAssistantResponse).toContain('chat/hotkeys-zh_cn.md');
  });

  it('supports /hotkey as an alias of /hotkeys', async () => {
    const result = await processUserMessage('/hotkey');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('chat/hotkeys.md'));
    expect(result).toMatchObject({
      displayUserMessage: false,
      sendToLLM: false,
      finalMessageForLLM: null,
      metadata: { command: 'hotkeys' },
    });
    expect(result.pseudoAssistantResponse).toContain('chat/hotkeys.md');
  });

  it('lists the new hotkeys commands for unknown slash commands', async () => {
    const result = await processUserMessage('/unknown foo');

    expect(storeState.setStatus).toHaveBeenCalledWith(
      'Unknown command: /unknown. Available commands: /clear, /welcome, /help, /hotkeys, /hotkey'
    );
    expect(result.pseudoAssistantResponse).toBe(
      'Unknown command: /unknown foo.\nAvailable commands: /clear, /welcome, /help, /hotkeys, /hotkey'
    );
    expect(result).toMatchObject({
      displayUserMessage: false,
      sendToLLM: false,
      finalMessageForLLM: null,
      metadata: { command: 'unknown' },
    });
  });

  it('blocks local-browser messages when the runtime is hard unsupported', async () => {
    detectLocalLLMRuntimeSupportMock.mockReturnValue({
      supported: false,
      webgpuExposed: false,
      crossOriginIsolated: false,
      sharedArrayBufferAvailable: false,
      secureContext: true,
      reason: 'Local browser LLM currently requires a browser with WebGPU support.',
    });

    const result = await processUserMessage('hello');

    expect(result.sendToLLM).toBe(false);
    expect(result.pseudoAssistantResponse).toContain('WebGPU');
    expect(result.metadata).toMatchObject({ error: 'local_browser_unsupported' });
  });

  it('allows local-browser messages when only SharedArrayBuffer isolation support is missing', async () => {
    detectLocalLLMRuntimeSupportMock.mockReturnValue({
      supported: true,
      webgpuExposed: true,
      crossOriginIsolated: false,
      sharedArrayBufferAvailable: false,
      secureContext: true,
      reason: 'This host may not support the local browser runtime reliably because cross-origin isolation or SharedArrayBuffer is unavailable. COOP/COEP headers may be missing.',
    });
    storeState.activeRegionId = 'region-1';

    const result = await processUserMessage('hello');

    expect(result.sendToLLM).toBe(true);
    expect(result.finalMessageForLLM).toContain('hello');
    expect(result.pseudoAssistantResponse).toBeNull();
  });
});
