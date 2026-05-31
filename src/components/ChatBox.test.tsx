import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatBox from './ChatBox';
import { I18nContext } from '../i18n/I18nProvider';
import { translate } from '../i18n/translate';

vi.mock('./chat', () => ({
  UserMessage: ({ content }: { content: string }) => <div>{content}</div>,
  AssistantMessage: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../agent/core/AgentCore', () => ({
  AgentCore: {
    instance: () => ({
      setLLMProvider: vi.fn(),
      getLLMProvider: vi.fn(),
      abortCurrentRequest: vi.fn(),
      getAgentState: vi.fn(() => ({ getMessages: vi.fn(() => []) })),
    }),
  },
}));

vi.mock('../agent/llm/LLMProvider', () => ({
  OpenAICompatibleLLMProvider: vi.fn(),
}));

vi.mock('../agent/llm/LocalBrowserLLMProvider', () => ({
  LocalBrowserLLMProvider: vi.fn(),
}));

vi.mock('../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      initialize: vi.fn().mockResolvedValue(undefined),
      get: (key: string) => {
        if (key === 'general.llm_provider') {
          return 'openai';
        }
        return '';
      },
      addChangeListener: () => () => undefined,
    }),
  },
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      setStatus: vi.fn(),
    }),
  },
}));

vi.mock('../agent/core/SystemPrompts', () => ({
  SystemPrompts: {
    getSystemPromptWithContext: vi.fn(),
  },
}));

vi.mock('../util/chatUtil', () => ({
  clearChatHistoryAndUI: vi.fn(),
  registerClearChatUICallback: vi.fn(),
}));

vi.mock('../util/messageFilter/UserMessageFilter', () => ({
  processUserMessage: vi.fn(),
}));

vi.mock('../hooks/useStreamProcessor', () => ({
  useStreamProcessor: () => ({
    abortController: null,
    processStream: vi.fn(),
  }),
}));

vi.mock('../utils/chatMessageUtils', () => ({
  createMessage: vi.fn(),
  addWelcomeMessage: vi.fn().mockResolvedValue(null),
}));

vi.mock('../util/timeUtil', () => ({
  formatLocalDateTime: vi.fn(),
}));

vi.mock('../util/miscUtil', () => ({
  downloadBlob: vi.fn(),
  buildTimestampSuffix: vi.fn(),
}));

vi.mock('../util/localLLMModelManager', () => ({
  LocalLLMModelManager: {
    getState: () => ({
      runtimeSupport: { supported: true, reason: null },
      isCached: false,
      isDownloading: false,
      isChecking: false,
      progressText: '',
      progressPercent: 0,
      error: null,
    }),
    subscribe: () => () => undefined,
  },
}));

vi.mock('../util/localLLMConfig', () => ({
  LOCAL_LLM_DISPLAY_NAME: 'Gemma 4 E4B',
  LOCAL_LLM_PROVIDER_KEY: 'local_browser',
}));

vi.mock('./common/KGDropdown', () => ({
  default: () => null,
}));

function renderWithLocale(resolvedLocale: 'en_us' | 'zh_cn') {
  return render(
    <I18nContext.Provider
      value={{
        languageSetting: resolvedLocale,
        resolvedLocale,
        setLanguageSetting: async () => undefined,
        t: (key, params) => translate(key, params, resolvedLocale),
      }}
    >
      <ChatBox isVisible={true} />
    </I18nContext.Provider>,
  );
}

describe('ChatBox', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the English assistant title under en_us', () => {
    renderWithLocale('en_us');

    expect(screen.getByRole('heading', { level: 3, name: 'K.G.Studio Musician Assistant' })).toBeTruthy();
  });

  it('renders the Chinese assistant title under zh_cn', () => {
    renderWithLocale('zh_cn');

    expect(screen.getByRole('heading', { level: 3, name: 'K.G.Studio 音乐创作助手' })).toBeTruthy();
  });
});
