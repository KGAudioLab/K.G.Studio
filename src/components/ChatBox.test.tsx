import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatBox from './ChatBox';
import { I18nContext } from '../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../i18n/types';
import { translate } from '../i18n/translate';

const {
  agentCoreMock,
  processUserMessageMock,
  processStreamMock,
} = vi.hoisted(() => ({
  agentCoreMock: {
    setLLMProvider: vi.fn(),
    getLLMProvider: vi.fn(() => ({ getPreferredSystemPromptPath: vi.fn() })),
    abortCurrentRequest: vi.fn(),
    getAgentState: vi.fn(() => ({
      getMessages: vi.fn(() => []),
      getTodos: vi.fn(() => []),
      subscribeTodoChanges: vi.fn(() => () => undefined),
    })),
    compactConversation: vi.fn(async () => ({ changed: true, compactedConversation: 'summary' })),
    shouldCompactBeforeNextTurn: vi.fn(async () => false),
  },
  processUserMessageMock: vi.fn(),
  processStreamMock: vi.fn(async () => ''),
}));

vi.mock('./chat', () => ({
  UserMessage: ({ content }: { content: string }) => <div>{content}</div>,
  AssistantMessage: ({
    content,
    todoSnapshot,
  }: {
    content: string;
    todoSnapshot?: Array<{ text: string }>;
  }) => (
    <div>
      {todoSnapshot ? `TODO SNAPSHOT: ${todoSnapshot.map(todo => todo.text).join(', ')}` : content}
    </div>
  ),
}));

vi.mock('../agent/core/AgentCore', () => ({
  AgentCore: {
    instance: () => agentCoreMock,
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
  processUserMessage: processUserMessageMock,
}));

vi.mock('../hooks/useStreamProcessor', () => ({
  useStreamProcessor: () => ({
    abortController: null,
    processStream: processStreamMock,
  }),
}));

vi.mock('../utils/chatMessageUtils', () => ({
  createMessage: vi.fn((role: 'user' | 'assistant', content: string) => ({
    id: `${role}-${content}`,
    role,
    content,
  })),
  createStreamingMessage: vi.fn(() => ({
    id: 'streaming-message',
    role: 'assistant',
    content: '<span class="processing-wave">Thinking...</span> click here to abort.',
    isStreaming: true,
    tokenCount: 0,
  })),
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

function renderWithLocale(resolvedLocale: ResolvedLocaleCode) {
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

  beforeEach(() => {
    processUserMessageMock.mockReset();
    processStreamMock.mockClear();
    agentCoreMock.compactConversation.mockClear();
    agentCoreMock.shouldCompactBeforeNextTurn.mockResolvedValue(false);
  });

  it('renders the English assistant title under en_us', () => {
    renderWithLocale('en_us');

    expect(screen.getByRole('heading', { level: 3, name: 'K.G.Studio Musician Assistant' })).toBeTruthy();
  });

  it('renders the Chinese assistant title under zh_cn', () => {
    renderWithLocale('zh_cn');

    expect(screen.getByRole('heading', { level: 3, name: 'K.G.Studio 音乐创作助手' })).toBeTruthy();
  });

  it('renders the French assistant title under fr_fr', () => {
    renderWithLocale('fr_fr');

    expect(screen.getByRole('heading', { level: 3, name: 'Assistant musical K.G.Studio' })).toBeTruthy();
  });

  it('shows compacting status and completion for /compact', async () => {
    processUserMessageMock.mockResolvedValue({
      displayUserMessage: false,
      sendToLLM: false,
      finalMessageForLLM: null,
      pseudoAssistantResponse: null,
      metadata: {
        command: 'compact',
        focus: 'keep the latest work',
      },
    });

    renderWithLocale('en_us');

    const input = screen.getByPlaceholderText('Press Enter to send message, Shift + Enter for new line');
    fireEvent.change(input, { target: { value: '/compact keep the latest work' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(agentCoreMock.compactConversation).toHaveBeenCalled();
      expect(screen.getByText('Conversation Compacted')).toBeTruthy();
    });
  });

  it('does not render a pinned todo checklist from agent state', async () => {
    renderWithLocale('en_us');

    await waitFor(() => {
      expect(screen.queryByText('Task Checklist')).toBeNull();
    });
  });
});
