import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GeneralSettings from './GeneralSettings';

const configState = new Map<string, unknown>([
  ['general.llm_provider', 'local_browser'],
  ['general.persist_api_keys_non_localhost', false],
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
    getState: () => ({
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
        reason: null,
      },
    }),
    subscribe: (listener: (state: unknown) => void) => {
      listener({
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
          reason: null,
        },
      });
      return () => {};
    },
    deleteCachedModel: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('GeneralSettings', () => {
  beforeEach(() => {
    configState.set('general.local_browser.context_length', 65536);
    configManagerMock.get.mockClear();
    configManagerMock.set.mockClear();
  });

  it('renders the local context length selector and VRAM hint', async () => {
    render(<GeneralSettings />);

    expect(await screen.findByText('Gemma 4 E4B Local Runtime')).toBeTruthy();
    expect(screen.getByLabelText('Context Length')).toBeTruthy();
    expect(screen.getByText(/require more VRAM/i)).toBeTruthy();
  });

  it('initializes the local context length from config', async () => {
    render(<GeneralSettings />);

    const select = await screen.findByLabelText('Context Length');
    expect((select as HTMLSelectElement).value).toBe('65536');
  });

  it('persists local context length changes', async () => {
    render(<GeneralSettings />);

    const select = await screen.findByLabelText('Context Length');
    fireEvent.change(select, { target: { value: '131072' } });

    await waitFor(() => {
      expect(configManagerMock.set).toHaveBeenCalledWith('general.local_browser.context_length', 131072);
    });
  });
});
