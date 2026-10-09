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
  ['general.uvr5_web_runtime.mdx_net_model_url', 'https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx'],
  ['general.uvr5_web_runtime.htdemucs_4s_model_url', 'https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx'],
  ['general.soundfont.base_url', 'https://cdn.jsdelivr.net/npm/soundfont-for-samplers/FluidR3_GM/'],
  ['general.kgone.enabled', false],
  ['general.kgone.base_url', 'http://127.0.0.1:8000'],
]);

const configManagerMock = {
  getIsInitialized: vi.fn(() => true),
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn((key: string) => configState.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    configState.set(key, value);
  }),
  isSoundfontServerManaged: vi.fn(() => false),
};

vi.mock('../../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => configManagerMock,
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
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
    localSeparatorModelCacheMock.delete.mockClear();
    localSeparatorModelCacheMock.exists.mockClear();
    localSeparatorModelCacheMock.exists.mockResolvedValue(true);
    soundfontInstrumentCacheMock.deleteAll.mockClear();
    soundfontInstrumentCacheMock.deleteInstrument.mockClear();
    soundfontInstrumentCacheMock.getCacheSummary.mockClear();
    soundfontInstrumentCacheMock.getCacheSummary.mockResolvedValue({ instrumentCount: 2, instruments: ['acoustic_grand_piano', 'violin'] });
  });

  it('does not expose legacy KGOne settings', async () => {
    configState.set('general.kgone.enabled', true);
    renderSettings();
    await screen.findByLabelText('Language');
    expect(screen.queryByText(/K\.G\.One/)).not.toBeInTheDocument();
    expect(configManagerMock.get).not.toHaveBeenCalledWith('general.kgone.enabled');
    expect(configManagerMock.get).not.toHaveBeenCalledWith('general.kgone.base_url');
    configState.set('general.kgone.enabled', false);
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

  it('renders and persists separator runtime download URLs', async () => {
    renderSettings();

    expect(screen.getByDisplayValue('https://huggingface.co/notabilia/uvr5-models/resolve/main/UVR-MDX-NET-Inst_HQ_3.onnx')).toBeTruthy();
    expect(screen.getByDisplayValue('https://huggingface.co/notabilia/uvr5-models/resolve/main/htdemucs_embedded.onnx')).toBeTruthy();

    const inputs = screen.getAllByRole('textbox');
    const uvr5UrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('UVR-MDX-NET-Inst_HQ_3.onnx'),
    ) as HTMLInputElement | undefined;
    const htdemucsUrlInput = inputs.find(input =>
      (input as HTMLInputElement).value.includes('htdemucs_embedded.onnx'),
    ) as HTMLInputElement | undefined;

    expect(uvr5UrlInput).toBeTruthy();
    expect(htdemucsUrlInput).toBeTruthy();

    fireEvent.change(uvr5UrlInput!, { target: { value: 'https://example.com/uvr5.onnx' } });
    fireEvent.change(htdemucsUrlInput!, { target: { value: 'https://example.com/htdemucs.onnx' } });

    await waitFor(() => {
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
    const uvr5DeleteButton = screen.getAllByRole('button', { name: 'Delete Cached Model' })[0];
    expect(uvr5DeleteButton).not.toBeDisabled();
    fireEvent.click(uvr5DeleteButton);

    await waitFor(() => {
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
      expect(screen.getAllByRole('button', { name: 'Delete Cached Model' })[0]).toBeDisabled();
    });
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
