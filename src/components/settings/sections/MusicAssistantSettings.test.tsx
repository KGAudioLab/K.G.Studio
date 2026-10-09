import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MusicAssistantSettings from './MusicAssistantSettings';
import SettingsPanel from '../SettingsPanel';
import { LocalLLMModelManager } from '../../../util/localLLMModelManager';
import type { ResolvedLocaleCode } from '../../../i18n/types';
import { I18nContext } from '../../../i18n/I18nProvider';
import { translate } from '../../../i18n/translate';

const { localSeparatorModelCacheMock } = vi.hoisted(() => ({
  localSeparatorModelCacheMock: {
    delete: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(true),
  },
}));

const { soundfontInstrumentCacheMock } = vi.hoisted(() => ({
  soundfontInstrumentCacheMock: {
    deleteInstrument: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    getCacheSummary: vi.fn().mockResolvedValue({ instrumentCount: 2, instruments: ['acoustic_grand_piano', 'violin'] }),
  },
}));

const configState = new Map<string, unknown>([
  ['general.language', 'auto'],
  ['general.agent_mode', 'regular'],
  ['general.llm_provider', 'local_browser'],
  ['general.persist_api_keys_non_localhost', false],
  ['general.auto_compact_threshold_percent', 90],
  ['general.openai.api_key', ''],
  ['general.openai.model', 'gpt-5.4-mini'],
  ['general.openai.flex', false],
  ['general.gemini.api_key', ''],
  ['general.gemini.model', 'gemini-2.5-flash'],
  ['general.claude.api_key', ''],
  ['general.claude.model', 'claude-sonnet-4.6'],
  ['general.claude_openrouter.api_key', ''],
  ['general.claude_openrouter.base_url', 'https://openrouter.ai/api/v1'],
  ['general.claude_openrouter.model', 'anthropic/claude-sonnet-4.6'],
  ['general.openai_compatible.api_key', ''],
  ['general.openai_compatible.base_url', ''],
  ['general.openai_compatible.model', ''],
  ['general.openai_compatible.reasoning_effort', 'medium'],
  ['general.local_browser.context_length', 65536],
  ['general.local_browser.model_url', 'https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task'],
  ['general.uvr5_web_runtime.mdx_net_model_url', 'https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx'],
  ['general.uvr5_web_runtime.htdemucs_4s_model_url', 'https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx'],
  ['general.soundfont.base_url', 'https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/'],
  ['general.kgone.enabled', false],
  ['general.kgone.base_url', 'http://127.0.0.1:8000'],
]);

const localModelState = {
  isCached: false,
  isChecking: false,
  isDownloading: false,
  isDeleting: false,
  progressPercent: 0,
  progressText: '',
  error: '',
  runtimeSupport: {
    supported: true,
    webgpuExposed: true,
    crossOriginIsolated: true,
    sharedArrayBufferAvailable: true,
    secureContext: true,
    reason: null as string | null,
  },
};

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    configState.set(key, value);
  }),
  getAll: vi.fn(() => ({ general: {} })),
  update: vi.fn(async (updates: { general: { llm_provider: string; openai_compatible: Record<string, string> } }) => {
    configState.set('general.llm_provider', updates.general.llm_provider);
    for (const [key, value] of Object.entries(updates.general.openai_compatible)) configState.set(`general.openai_compatible.${key}`, value);
  }),
  isSoundfontServerManaged: vi.fn(() => false),
};

vi.mock('../../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
  },
}));

vi.mock('../../../util/localLLMModelManager', () => ({
  LocalLLMModelManager: {
    getState: () => localModelState,
    subscribe: vi.fn((listener: (state: unknown) => void) => {
      listener({ ...localModelState });
      return vi.fn();
    }),
    deleteCachedModel: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../util/local-separator/modelCache', () => ({
  LocalSeparatorModelCache: localSeparatorModelCacheMock,
}));

vi.mock('../../../util/soundfontInstrumentCache', () => ({
  SoundfontInstrumentCache: soundfontInstrumentCacheMock,
}));

vi.mock('./AudioIOSettings', () => ({ default: () => null }));
vi.mock('./BehaviorSettings', () => ({ default: () => null }));
vi.mock('./TemplatesSettings', () => ({ default: () => null }));
vi.mock('./ChordGuideSettings', () => ({ default: () => null }));

describe('MusicAssistantSettings', () => {
  const renderSettings = (locale: ResolvedLocaleCode = 'en_us', content: React.ReactNode = <MusicAssistantSettings />) => render(
    <I18nContext.Provider
      value={{
        languageSetting: 'auto',
        resolvedLocale: locale,
        setLanguageSetting: async (value) => {
          await configManagerMock.set('general.language', value);
        },
        t: (key, params) => translate(key, params, locale),
      }}
    >
      {content}
    </I18nContext.Provider>,
  );

  beforeEach(() => {
    configState.set('general.language', 'auto');
    configState.set('general.agent_mode', 'regular');
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.local_browser.context_length', 65536);
    configState.set('general.auto_compact_threshold_percent', 90);
    configState.set('general.persist_api_keys_non_localhost', false);
    configState.set('general.openai.flex', false);
    configState.set('general.openai.api_key', '');
    configState.set('general.openai.model', 'gpt-5.4-mini');
    configState.set('general.claude_openrouter.api_key', '');
    configState.set('general.claude_openrouter.model', 'anthropic/claude-sonnet-4.6');
    configState.set('general.openai_compatible.api_key', '');
    configState.set('general.openai_compatible.base_url', '');
    configState.set('general.openai_compatible.model', '');
    configState.set('general.openai_compatible.reasoning_effort', 'medium');
    configState.set('general.local_browser.model_url', 'https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task');
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
    configManagerMock.update.mockClear();
    localModelState.isCached = false;
    localModelState.isChecking = false;
    localModelState.isDownloading = false;
    localModelState.isDeleting = false;
    localModelState.progressPercent = 0;
    localModelState.progressText = '';
    localModelState.error = '';
    localModelState.runtimeSupport = {
      supported: true,
      webgpuExposed: true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      secureContext: true,
      reason: null,
    };
    localSeparatorModelCacheMock.delete.mockClear();
    localSeparatorModelCacheMock.exists.mockClear();
    localSeparatorModelCacheMock.exists.mockResolvedValue(true);
    soundfontInstrumentCacheMock.deleteAll.mockClear();
    soundfontInstrumentCacheMock.deleteInstrument.mockClear();
    soundfontInstrumentCacheMock.getCacheSummary.mockClear();
    soundfontInstrumentCacheMock.getCacheSummary.mockResolvedValue({ instrumentCount: 2, instruments: ['acoustic_grand_piano', 'violin'] });
  });

  it('renders the local context length selector and VRAM hint', async () => {
    renderSettings();

    expect(await screen.findByText('Gemma 4 E4B Local Runtime')).toBeTruthy();
    expect(screen.getByLabelText('Context Length')).toBeTruthy();
    expect(screen.getByText(/require more VRAM/i)).toBeTruthy();
  });

  it('initializes the local context length from config', async () => {
    renderSettings();

    const select = await screen.findByLabelText('Context Length');
    expect((select as HTMLSelectElement).value).toBe('65536');
  });

  it('persists local context length changes', async () => {
    renderSettings();

    const select = await screen.findByLabelText('Context Length');
    fireEvent.change(select, { target: { value: '131072' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.local_browser.context_length', 131072);
    });
  });

  it('renders and persists the auto-compact threshold', async () => {
    renderSettings();

    const select = await screen.findByLabelText(translate('settings.general.autoCompactThreshold.label', undefined, 'en_us'));
    expect((select as HTMLSelectElement).value).toBe('90');

    fireEvent.change(select, { target: { value: '80' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.auto_compact_threshold_percent', 80);
    });
  });

  it('renders the auto-compact threshold label from the zh_cn catalog', async () => {
    renderSettings('zh_cn');

    expect(
      await screen.findByLabelText(translate('settings.general.autoCompactThreshold.label', undefined, 'zh_cn')),
    ).toBeTruthy();
  });

  it('places Agent Mode at the bottom of Assistant Settings and initializes its value', async () => {
    configState.set('general.llm_provider', 'openai_compatible');
    configState.set('general.agent_mode', 'efficient');

    renderSettings();

    const providerGroup = screen.getByRole('heading', { name: 'Assistant Settings' }).parentElement!;
    expect(within(providerGroup).getByLabelText('Agent Mode')).toBeTruthy();
    expect(providerGroup.lastElementChild).toContainElement(screen.getByLabelText('Agent Mode'));
    expect(screen.queryByRole('heading', { name: 'K.G.Studio Music Assistant' })).toBeNull();
    const select = screen.getByLabelText('Agent Mode');
    expect((select as HTMLSelectElement).value).toBe('efficient');
  });

  it('defaults to Advanced Mode when no agent mode is saved', async () => {
    configState.set('general.llm_provider', 'openai_compatible');
    configState.delete('general.agent_mode');
    renderSettings();
    expect(await screen.findByLabelText('Agent Mode')).toHaveValue('advanced');
  });

  it('initializes Advanced Mode and lists it first', async () => {
    configState.set('general.llm_provider', 'openai_compatible');
    configState.set('general.agent_mode', 'advanced');

    renderSettings();

    const select = await screen.findByLabelText('Agent Mode');
    expect(select).toHaveValue('advanced');
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual([
      'Advanced Mode', 'Regular Mode', 'Efficient Mode',
    ]);
  });

  it.each(['efficient', 'advanced'])('persists %s mode for non-local providers', async (mode) => {
    configState.set('general.llm_provider', 'openai_compatible');

    renderSettings();

    const select = await screen.findByLabelText('Agent Mode');
    fireEvent.change(select, { target: { value: mode } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.agent_mode', mode);
    });
  });

  it.each(['regular', 'advanced'])('disables the agent mode selector for the local browser provider with %s configured', async (mode) => {
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.agent_mode', mode);

    renderSettings();

    const select = await screen.findByLabelText('Agent Mode');
    expect(select).toBeDisabled();
    expect(screen.getByText('Local LLM (Browser) always runs the assistant in Efficient Mode.')).toBeTruthy();
  });

  it('renders and persists local runtime download URLs', async () => {
    renderSettings();

    expect(await screen.findByDisplayValue('https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task')).toBeTruthy();

    const inputs = screen.getAllByRole('textbox');
    const gemmaUrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('gemma-4-E4B-it-web.task'),
    ) as HTMLInputElement | undefined;
    expect(gemmaUrlInput).toBeTruthy();

    fireEvent.change(gemmaUrlInput!, { target: { value: 'https://example.com/gemma.task' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.local_browser.model_url', 'https://example.com/gemma.task');
    });
  });

  it('keeps local runtime available when runtime may fail on this host', async () => {
    localModelState.runtimeSupport = {
      supported: true,
      webgpuExposed: true,
      crossOriginIsolated: false,
      sharedArrayBufferAvailable: false,
      secureContext: true,
      reason: 'This host may not support the local browser runtime reliably because cross-origin isolation or SharedArrayBuffer is unavailable. COOP/COEP headers may be missing.',
    };

    renderSettings();

    expect(await screen.findByText('Gemma 4 E4B Local Runtime')).toBeTruthy();
    expect(screen.queryByText(/may not support the local browser runtime reliably/i)).toBeNull();
    expect(screen.getByText(/The local model downloads automatically/i)).toBeTruthy();
  });

  it('keeps the settings sections exclusively in Music Assistant and preserves sidebar order', async () => {
    const onClose = vi.fn();
    renderSettings('en_us', <SettingsPanel onClose={onClose} />);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getAllByRole('button').map(button => button.textContent)).toEqual([
      'General', 'Music Assistant', 'Audio I/O', 'Behavior', 'Templates', 'Chord Guide',
    ]);
    const generalGroups = ['UVR5 Web Runtime', 'Soundfont Settings', 'AIRE Settings'];
    expect(screen.getByRole('heading', { level: 3, name: 'General' })).toBeTruthy();
    expect(screen.getByLabelText('Language')).toBeTruthy();
    const assistantGroups = [
      'Assistant Settings', 'Gemma 4 E4B Local Runtime',
    ];
    for (const name of assistantGroups) expect(screen.queryByRole('heading', { name })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)).toEqual(generalGroups);
    fireEvent.click(within(nav).getByRole('button', { name: 'Music Assistant' }));
    expect(screen.getByRole('heading', { level: 3, name: 'Music Assistant' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)).toEqual(assistantGroups);
    expect(screen.queryByLabelText('Language')).toBeNull();
    for (const name of generalGroups) expect(screen.queryByRole('heading', { name })).toBeNull();
    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));
    expect(await screen.findByLabelText('Language')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Close Settings'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    ['en_us', 'Music Assistant'], ['fr_fr', 'Assistant musical'],
    ['zh_cn', '音乐创作助手'], ['zh_hk', '音樂創作助手'],
  ] as const)('uses the confirmed tab and title translation for %s', (locale, label) => {
    renderSettings(locale, <SettingsPanel onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByRole('heading', { level: 3, name: label })).toBeTruthy();
  });

  afterEach(() => vi.useRealTimers());

  describe('compatible configuration', () => {
    beforeEach(() => configState.set('general.llm_provider', 'openai_compatible'));

    it('loads and saves compatible credentials and manual edits after 500 ms', async () => {
      vi.useFakeTimers();
      configState.set('general.openai_compatible.api_key', 'saved-compatible');
      renderSettings();
      const updates = [
        [screen.getByLabelText('Thinking Level'), 'general.openai_compatible.reasoning_effort', 'high'],
        [screen.getByDisplayValue('saved-compatible'), 'general.openai_compatible.api_key', 'updated-key'],
        [screen.getByPlaceholderText(translate('settings.general.openaiCompatible.baseUrlPlaceholder')), 'general.openai_compatible.base_url', 'https://example.com/v1'],
        [screen.getByPlaceholderText(translate('settings.general.openaiCompatible.modelPlaceholder')), 'general.openai_compatible.model', 'updated-model'],
      ] as const;
      for (const [input, , value] of updates) fireEvent.change(input, { target: { value } });
      await act(() => vi.advanceTimersByTimeAsync(499));
      expect(configManagerMock.set).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(1));
      for (const [, key, value] of updates) expect(configManagerMock.set).toHaveBeenCalledWith(key, value);
    });

    it('defaults missing thinking level to medium and preserves an explicit empty value', () => {
      configState.delete('general.openai_compatible.reasoning_effort');
      const first = renderSettings();
      expect(screen.getByLabelText('Thinking Level')).toHaveValue('medium');
      first.unmount();
      configState.set('general.openai_compatible.reasoning_effort', '');
      renderSettings();
      expect(screen.getByLabelText('Thinking Level')).toHaveValue('');
    });

    it('preserves a pending thinking level edit when applying a preset', async () => {
      vi.useFakeTimers();
      renderSettings();
      fireEvent.change(screen.getByLabelText('Thinking Level'), { target: { value: 'xhigh' } });
      fireEvent.click(screen.getByRole('link', { name: 'OpenAI' }));
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(configState.get('general.openai_compatible.reasoning_effort')).toBe('xhigh');
      expect(configManagerMock.set).not.toHaveBeenCalled();
    });

    it('offers only the two supported modes and removes legacy sections and Flex', () => {
      renderSettings();
      const mode = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(Array.from(mode.options).map(option => option.value)).toEqual(['local_browser', 'openai_compatible']);
      expect(screen.queryByRole('heading', { name: 'OpenAI' })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Anthropic Claude (via OpenRouter)' })).toBeNull();
      expect(screen.queryByText('Flex Mode')).toBeNull();
      expect(screen.getAllByRole('link', { name: 'CLIProxyAPI' })[0].getAttribute('href')).toBe('https://github.com/router-for-me/CLIProxyAPI');
    });

    const presets = [
      ['OpenAI', 'https://api.openai.com/v1', '', 'gpt-6.1-sol'],
      ['Claude (via OpenRouter)', 'https://openrouter.ai/api/v1', '', 'anthropic/claude-sonnet-5.5'],
      ['OpenRouter', 'https://openrouter.ai/api/v1', '', ''],
      ['Ollama', 'http://localhost:11434/v1', '', ''],
      ['llama.cpp', 'http://localhost:8080/v1', '', ''],
      ['CLIProxyAPI', 'http://127.0.0.1:8317/v1', '', ''],
    ] as const;

    it.each(presets)('applies %s in one batch, replacing every field and activating compatible mode', async (name, url, key, model) => {
      configState.set('general.openai_compatible.api_key', 'previous-key');
      configState.set('general.openai_compatible.base_url', 'https://previous.example/v1');
      configState.set('general.openai_compatible.model', 'previous-model');
      renderSettings();
      fireEvent.click(screen.getAllByRole('link', { name }).at(-1)!);
      await waitFor(() => expect(configManagerMock.update).toHaveBeenCalledOnce());
      expect(configManagerMock.update).toHaveBeenCalledWith({ general: {
        llm_provider: 'openai_compatible', openai_compatible: { api_key: key, base_url: url, model, reasoning_effort: 'medium' },
      } });
      expect(configManagerMock.set).not.toHaveBeenCalled();
      expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('openai_compatible');
      expect((screen.getByPlaceholderText(translate('settings.general.openaiCompatible.keyPlaceholder')) as HTMLInputElement).value).toBe(key);
      expect((screen.getByPlaceholderText(translate('settings.general.openaiCompatible.baseUrlPlaceholder')) as HTMLInputElement).value).toBe(url);
      expect((screen.getByPlaceholderText(translate('settings.general.openaiCompatible.modelPlaceholder')) as HTMLInputElement).value).toBe(model);
    });

    it('lists presets in the confirmed order and cancels pending edits before a preset', async () => {
      vi.useFakeTimers();
      renderSettings();
      const links = screen.getAllByRole('link').filter(link => link.getAttribute('href') === '#');
      expect(links.map(link => link.textContent).slice(0, 6)).toEqual(presets.map(preset => preset[0]));
      for (const input of [
        screen.getByPlaceholderText(translate('settings.general.openaiCompatible.keyPlaceholder')),
        screen.getByPlaceholderText(translate('settings.general.openaiCompatible.baseUrlPlaceholder')),
        screen.getByPlaceholderText(translate('settings.general.openaiCompatible.modelPlaceholder')),
      ]) fireEvent.change(input, { target: { value: 'stale-edit' } });
      fireEvent.click(screen.getByRole('link', { name: 'OpenAI' }));
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(configManagerMock.set).not.toHaveBeenCalled();
      expect(configState.get('general.openai_compatible.model')).toBe('gpt-6.1-sol');
    });

    it('cancels edits from a previous tab mount when a preset is applied after switching tabs', async () => {
      vi.useFakeTimers();
      renderSettings('en_us', <SettingsPanel onClose={() => {}} />);
      const musicTab = screen.getByRole('button', { name: 'Music Assistant' });
      fireEvent.click(musicTab);
      fireEvent.change(screen.getByPlaceholderText(translate('settings.general.openaiCompatible.modelPlaceholder')), { target: { value: 'stale-model' } });
      fireEvent.click(screen.getByRole('button', { name: 'General' }));
      fireEvent.click(musicTab);
      fireEvent.click(screen.getByRole('link', { name: 'OpenAI' }));
      await act(() => vi.advanceTimersByTimeAsync(600));
      expect(configManagerMock.set).not.toHaveBeenCalled();
      expect(configState.get('general.openai_compatible.model')).toBe('gpt-6.1-sol');
    });

    it.each(['en_us', 'fr_fr', 'zh_cn', 'zh_hk'] as const)('localizes the connection title, hint, and preset label in %s', locale => {
      renderSettings(locale);
      for (const key of ['section', 'helpIntro', 'helpSubscriptionBefore', 'helpSubscriptionAfter', 'presets', 'thinkingLevelHelp', 'thinkingLevelPresets']) {
        const section = screen.getByRole('heading', { name: translate('settings.general.openaiCompatible.section', undefined, locale) }).parentElement!;
        expect(section.textContent).toContain(translate(`settings.general.openaiCompatible.${key}`, undefined, locale));
      }
    });

  });

  it('shows only the selected provider panel and retains edits when switching modes', async () => {
    vi.useFakeTimers();
    renderSettings();
    const provider = screen.getAllByRole('combobox')[0];
    expect(screen.getByRole('heading', { name: 'Gemma 4 E4B Local Runtime' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'LLM Provider (OpenAI Compatible)' })).toBeNull();
    fireEvent.change(provider, { target: { value: 'openai_compatible' } });
    expect(screen.queryByRole('heading', { name: 'Gemma 4 E4B Local Runtime' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'LLM Provider (OpenAI Compatible)' })).toBeTruthy();
    expect(screen.getByLabelText('Agent Mode')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Thinking Level'), { target: { value: 'high' } });
    fireEvent.change(provider, { target: { value: 'local_browser' } });
    expect(screen.queryByLabelText('Thinking Level')).toBeNull();
    expect(screen.getByLabelText('Agent Mode')).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(configState.get('general.openai_compatible.reasoning_effort')).toBe('high');
    fireEvent.change(provider, { target: { value: 'openai_compatible' } });
    expect(screen.getByLabelText('Thinking Level')).toHaveValue('high');
  });

  it('lists thinking presets in ascending order and saves each exact value', async () => {
    vi.useFakeTimers();
    configState.set('general.llm_provider', 'openai_compatible');
    renderSettings();
    const input = screen.getByLabelText('Thinking Level');
    const item = input.parentElement!;
    const levels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    expect(within(item).getAllByRole('link').map(link => link.textContent)).toEqual(levels);
    expect(item.textContent).toContain(translate('settings.general.openaiCompatible.thinkingLevelHelp'));
    fireEvent.change(input, { target: { value: 'stale-edit' } });
    for (const level of levels) {
      fireEvent.click(within(item).getByRole('link', { name: level }));
      expect(input).toHaveValue(level);
      await act(() => vi.advanceTimersByTimeAsync(500));
      expect(configState.get('general.openai_compatible.reasoning_effort')).toBe(level);
    }
    expect(configManagerMock.set).not.toHaveBeenCalledWith('general.openai_compatible.reasoning_effort', 'stale-edit');
  });

  it('restores the local model URL and deletes its cache', async () => {
    localModelState.isCached = true;
    renderSettings();
    fireEvent.click(screen.getByText('Restore default'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cached Model' }));
    await waitFor(() => {
      expect(LocalLLMModelManager.deleteCachedModel).toHaveBeenCalledOnce();
      expect(configManagerMock.set).toHaveBeenCalledWith('general.local_browser.model_url',
        'https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task');
    });
  });

  it('resubscribes and shows current model download progress after switching tabs', () => {
    renderSettings('en_us', <SettingsPanel onClose={() => {}} />);
    const musicTab = screen.getByRole('button', { name: 'Music Assistant' });
    fireEvent.click(musicTab);
    const subscription = vi.mocked(LocalLLMModelManager.subscribe);
    const unsubscribe = subscription.mock.results.at(-1)!.value;
    const listener = subscription.mock.calls.at(-1)![0];
    act(() => listener({ ...localModelState, isDownloading: true, progressPercent: 25, progressText: 'Downloading model: 25%' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    fireEvent.click(screen.getByRole('button', { name: 'General' }));
    expect(unsubscribe).toHaveBeenCalledOnce();
    localModelState.isDownloading = true;
    localModelState.progressPercent = 75;
    localModelState.progressText = 'Downloading model: 75%';
    fireEvent.click(musicTab);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('Downloading model: 75%')).toBeTruthy();
  });
});
