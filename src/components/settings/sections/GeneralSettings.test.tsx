import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GeneralSettings from './GeneralSettings';
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
  isKGOneServerManaged: vi.fn(() => false),
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
    subscribe: (listener: (state: unknown) => void) => {
      listener(localModelState);
      return () => {};
    },
    deleteCachedModel: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../util/local-separator/modelCache', () => ({
  LocalSeparatorModelCache: localSeparatorModelCacheMock,
}));

vi.mock('../../../util/soundfontInstrumentCache', () => ({
  SoundfontInstrumentCache: soundfontInstrumentCacheMock,
}));

describe('GeneralSettings', () => {
  const renderSettings = (locale: 'en_us' | 'zh_cn' = 'en_us') => render(
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
      <GeneralSettings />
    </I18nContext.Provider>,
  );

  beforeEach(() => {
    configState.set('general.language', 'auto');
    configState.set('general.agent_mode', 'regular');
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.local_browser.context_length', 65536);
    configState.set('general.auto_compact_threshold_percent', 90);
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
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

  it('uses native language names in the language dropdown', async () => {
    renderSettings();

    const select = await screen.findByLabelText('Language');
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.text);

    expect(options).toEqual(['Auto', 'English', 'Français', '简体中文', '繁體中文']);
  });

  it('localizes the auto label while keeping language names native', async () => {
    renderSettings('zh_cn');

    const select = await screen.findByLabelText('语言');
    const options = Array.from((select as HTMLSelectElement).options).map((option) => option.text);

    expect(options).toEqual(['自动', 'English', 'Français', '简体中文', '繁體中文']);
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

  it('renders the music assistant section and initializes the agent mode selector', async () => {
    configState.set('general.llm_provider', 'openai');
    configState.set('general.agent_mode', 'efficient');

    renderSettings();

    expect(await screen.findByText('K.G.Studio Music Assistant')).toBeTruthy();
    const select = screen.getByLabelText('Agent Mode');
    expect((select as HTMLSelectElement).value).toBe('efficient');
  });

  it('persists agent mode changes for non-local providers', async () => {
    configState.set('general.llm_provider', 'openai');

    renderSettings();

    const select = await screen.findByLabelText('Agent Mode');
    fireEvent.change(select, { target: { value: 'efficient' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.agent_mode', 'efficient');
    });
  });

  it('disables the agent mode selector for the local browser provider and shows override help', async () => {
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.agent_mode', 'regular');

    renderSettings();

    const select = await screen.findByLabelText('Agent Mode');
    expect(select).toBeDisabled();
    expect(screen.getByText('Local LLM (Browser) always runs the assistant in Efficient Mode.')).toBeTruthy();
  });

  it('renders and persists local runtime download URLs', async () => {
    renderSettings();

    expect(await screen.findByDisplayValue('https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task')).toBeTruthy();
    expect(screen.getByDisplayValue('https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx')).toBeTruthy();
    expect(screen.getByDisplayValue('https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx')).toBeTruthy();

    const inputs = screen.getAllByRole('textbox');
    const gemmaUrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('gemma-4-E4B-it-web.task'),
    ) as HTMLInputElement | undefined;
    const uvr5UrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('UVR-MDX-NET-Inst_HQ_3.onnx'),
    ) as HTMLInputElement | undefined;
    const htdemucsUrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('htdemucs_embedded.onnx'),
    ) as HTMLInputElement | undefined;

    expect(gemmaUrlInput).toBeTruthy();
    expect(uvr5UrlInput).toBeTruthy();
    expect(htdemucsUrlInput).toBeTruthy();

    fireEvent.change(gemmaUrlInput!, { target: { value: 'https://example.com/gemma.task' } });
    fireEvent.change(uvr5UrlInput!, { target: { value: 'https://example.com/uvr5.onnx' } });
    fireEvent.change(htdemucsUrlInput!, { target: { value: 'https://example.com/htdemucs.onnx' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.local_browser.model_url', 'https://example.com/gemma.task');
      expect(configManagerMock.set).toHaveBeenCalledWith('general.uvr5_web_runtime.mdx_net_model_url', 'https://example.com/uvr5.onnx');
      expect(configManagerMock.set).toHaveBeenCalledWith('general.uvr5_web_runtime.htdemucs_4s_model_url', 'https://example.com/htdemucs.onnx');
    });
  });

  it('restores default download URLs and deletes the UVR5 model cache', async () => {
    localSeparatorModelCacheMock.exists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);

    renderSettings();

    expect(await screen.findByText('UVR5 Web Runtime')).toBeTruthy();

    const restoreLinks = screen.getAllByText('Restore default');
    fireEvent.click(restoreLinks[0]);
    fireEvent.click(restoreLinks[1]);
    fireEvent.click(restoreLinks[2]);
    const uvr5DeleteButton = screen.getAllByRole('button', { name: 'Delete Cached Model' })[1];
    expect(uvr5DeleteButton).not.toBeDisabled();
    fireEvent.click(uvr5DeleteButton);

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith(
        'general.local_browser.model_url',
        'https://huggingface.co/notabilia/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.task',
      );
      expect(configManagerMock.set).toHaveBeenCalledWith(
        'general.uvr5_web_runtime.mdx_net_model_url',
        'https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx',
      );
      expect(configManagerMock.set).toHaveBeenCalledWith(
        'general.uvr5_web_runtime.htdemucs_4s_model_url',
        'https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx',
      );
      expect(localSeparatorModelCacheMock.delete).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Delete Cached Model' })[1]).toBeDisabled();
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

  it('renders language first and persists language changes', async () => {
    renderSettings();

    const languageSelect = await screen.findByLabelText('Language');
    expect(languageSelect).toBeTruthy();
    expect(screen.getAllByRole('combobox')[0]).toBe(languageSelect);
    expect(screen.getByRole('option', { name: 'Français' })).toBeTruthy();

    fireEvent.change(languageSelect, { target: { value: 'fr_fr' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.language', 'fr_fr');
    });
  });

  it('renders the soundfont cache status and deletes all cached soundfonts', async () => {
    soundfontInstrumentCacheMock.getCacheSummary
      .mockResolvedValueOnce({ instrumentCount: 2, instruments: ['acoustic_grand_piano', 'violin'] })
      .mockResolvedValueOnce({ instrumentCount: 0, instruments: [] });

    renderSettings();

    expect(await screen.findByText('Soundfont Settings')).toBeTruthy();
    expect(screen.getByText('2 instruments cached in browser storage.')).toBeTruthy();

    const soundfontDeleteButton = screen.getByRole('button', { name: 'Delete Soundfont Cache' });
    expect(soundfontDeleteButton).not.toBeDisabled();
    fireEvent.click(soundfontDeleteButton);

    await waitFor(() => {
      expect(soundfontInstrumentCacheMock.deleteAll).toHaveBeenCalledOnce();
    });

    await waitFor(() => {
      expect(screen.getByText('No cached instruments yet.')).toBeTruthy();
    });
  });

  it('deletes the selected cached soundfont instrument', async () => {
    soundfontInstrumentCacheMock.getCacheSummary
      .mockResolvedValueOnce({ instrumentCount: 2, instruments: ['acoustic_grand_piano', 'violin'] })
      .mockResolvedValueOnce({ instrumentCount: 1, instruments: ['acoustic_grand_piano'] });

    renderSettings();

    const select = await screen.findByLabelText('Cached Instrument');
    fireEvent.change(select, { target: { value: 'violin' } });

    const deleteSelectedButton = screen.getByRole('button', { name: 'Delete Selected Instrument Cache' });
    expect(deleteSelectedButton).not.toBeDisabled();
    fireEvent.click(deleteSelectedButton);

    await waitFor(() => {
      expect(soundfontInstrumentCacheMock.deleteInstrument).toHaveBeenCalledWith('violin');
    });

    await waitFor(() => {
      expect(screen.getByText('1 instruments cached in browser storage.')).toBeTruthy();
    });
  });
});
