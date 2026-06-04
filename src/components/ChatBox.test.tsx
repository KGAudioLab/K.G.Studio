import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatBox from './ChatBox';
import { I18nContext } from '../i18n/I18nProvider';
import type { ResolvedLocaleCode } from '../i18n/types';
import { translate } from '../i18n/translate';
import type { ChatMessage } from '../types/projectTypes';

const {
  agentCoreMock,
  processUserMessageMock,
  processStreamMock,
  streamProcessorCallbacks,
  clearChatHistoryAndUIMock,
  projectStoreState,
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
  clearChatHistoryAndUIMock: vi.fn(),
  projectStoreState: {
    toolFastForwardEnabled: false,
    setStatus: vi.fn(),
    setToolFastForwardEnabled: vi.fn(),
    toggleToolFastForwardEnabled: vi.fn(),
  },
  streamProcessorCallbacks: {
    onMessageAdd: undefined as ((message: ChatMessage) => void) | undefined,
    onMessageUpdate: undefined as ((messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void) | undefined,
    onMessageRemove: undefined as ((messageId: string) => void) | undefined,
    onProcessingChange: undefined as ((isProcessing: boolean) => void) | undefined,
  },
}));

projectStoreState.setToolFastForwardEnabled.mockImplementation((enabled: boolean) => {
  projectStoreState.toolFastForwardEnabled = enabled;
});
projectStoreState.toggleToolFastForwardEnabled.mockImplementation(() => {
  projectStoreState.toolFastForwardEnabled = !projectStoreState.toolFastForwardEnabled;
});

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
  useProjectStore: Object.assign(
    ((selector?: (state: typeof projectStoreState) => unknown) => (
      selector ? selector(projectStoreState) : projectStoreState
    )) as never,
    {
      getState: () => projectStoreState,
    }
  ),
}));

vi.mock('../agent/core/SystemPrompts', () => ({
  SystemPrompts: {
    getSystemPromptWithContext: vi.fn(),
  },
}));

vi.mock('../util/chatUtil', () => ({
  clearChatHistoryAndUI: clearChatHistoryAndUIMock,
  registerClearChatUICallback: vi.fn(),
}));

vi.mock('../util/messageFilter/UserMessageFilter', () => ({
  processUserMessage: processUserMessageMock,
}));

vi.mock('../hooks/useStreamProcessor', () => ({
  useStreamProcessor: (options: typeof streamProcessorCallbacks) => {
    streamProcessorCallbacks.onMessageAdd = options.onMessageAdd;
    streamProcessorCallbacks.onMessageUpdate = options.onMessageUpdate;
    streamProcessorCallbacks.onMessageRemove = options.onMessageRemove;
    streamProcessorCallbacks.onProcessingChange = options.onProcessingChange;

    return {
      abortController: null,
      processStream: processStreamMock,
    };
  },
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
    clearChatHistoryAndUIMock.mockClear();
    agentCoreMock.compactConversation.mockClear();
    agentCoreMock.shouldCompactBeforeNextTurn.mockResolvedValue(false);
    streamProcessorCallbacks.onMessageAdd = undefined;
    streamProcessorCallbacks.onMessageUpdate = undefined;
    streamProcessorCallbacks.onMessageRemove = undefined;
    streamProcessorCallbacks.onProcessingChange = undefined;
    projectStoreState.toolFastForwardEnabled = false;
    projectStoreState.setStatus.mockClear();
    projectStoreState.setToolFastForwardEnabled.mockClear();
    projectStoreState.toggleToolFastForwardEnabled.mockClear();
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

  it('removes older incomplete todo snapshots before appending a new one', async () => {
    processUserMessageMock.mockResolvedValue({
      displayUserMessage: false,
      sendToLLM: true,
      finalMessageForLLM: 'todo prompt',
      pseudoAssistantResponse: null,
      metadata: null,
    });
    processStreamMock.mockImplementation(async () => {
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-1',
        role: 'assistant',
        content: 'todo 1',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Inspect melody', status: 'completed', updatedAt: 1 },
          { id: '2', text: 'Write harmony', status: 'in_progress', updatedAt: 2 },
        ],
      });
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-2',
        role: 'assistant',
        content: 'todo 2',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Inspect melody', status: 'completed', updatedAt: 3 },
          { id: '2', text: 'Write bass', status: 'pending', updatedAt: 4 },
        ],
      });
      return '';
    });

    renderWithLocale('en_us');

    const input = screen.getByPlaceholderText('Press Enter to send message, Shift + Enter for new line');
    fireEvent.change(input, { target: { value: 'todo cleanup' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.queryByText('TODO SNAPSHOT: Inspect melody, Write harmony')).toBeNull();
      expect(screen.getByText('TODO SNAPSHOT: Inspect melody, Write bass')).toBeTruthy();
    });
  });

  it('preserves completed todo snapshots when a new incomplete snapshot is added', async () => {
    processUserMessageMock.mockResolvedValue({
      displayUserMessage: false,
      sendToLLM: true,
      finalMessageForLLM: 'todo prompt',
      pseudoAssistantResponse: null,
      metadata: null,
    });
    processStreamMock.mockImplementation(async () => {
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-complete',
        role: 'assistant',
        content: 'done snapshot',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Inspect melody', status: 'completed', updatedAt: 1 },
          { id: '2', text: 'Write harmony', status: 'completed', updatedAt: 2 },
        ],
      });
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-active',
        role: 'assistant',
        content: 'active snapshot',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Mix stems', status: 'completed', updatedAt: 3 },
          { id: '2', text: 'Render bounce', status: 'in_progress', updatedAt: 4 },
        ],
      });
      return '';
    });

    renderWithLocale('en_us');

    const input = screen.getByPlaceholderText('Press Enter to send message, Shift + Enter for new line');
    fireEvent.change(input, { target: { value: 'todo preserve' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('TODO SNAPSHOT: Inspect melody, Write harmony')).toBeTruthy();
      expect(screen.getByText('TODO SNAPSHOT: Mix stems, Render bounce')).toBeTruthy();
    });
  });

  it('does not remove non-todo assistant messages during todo cleanup', async () => {
    processUserMessageMock.mockResolvedValue({
      displayUserMessage: false,
      sendToLLM: true,
      finalMessageForLLM: 'todo prompt',
      pseudoAssistantResponse: null,
      metadata: null,
    });
    processStreamMock.mockImplementation(async () => {
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'assistant-note',
        role: 'assistant',
        content: 'Normal assistant message',
      });
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-1',
        role: 'assistant',
        content: 'todo 1',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Inspect melody', status: 'pending', updatedAt: 1 },
        ],
      });
      streamProcessorCallbacks.onMessageAdd?.({
        id: 'todo-2',
        role: 'assistant',
        content: 'todo 2',
        toolName: 'update_todo_list',
        toolSuccess: true,
        todoSnapshot: [
          { id: '1', text: 'Render bounce', status: 'in_progress', updatedAt: 2 },
        ],
      });
      return '';
    });

    renderWithLocale('en_us');

    const input = screen.getByPlaceholderText('Press Enter to send message, Shift + Enter for new line');
    fireEvent.change(input, { target: { value: 'todo cleanup keep assistant' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText('Normal assistant message')).toBeTruthy();
      expect(screen.queryByText('TODO SNAPSHOT: Inspect melody')).toBeNull();
      expect(screen.getByText('TODO SNAPSHOT: Render bounce')).toBeTruthy();
    });
  });

  it('renders and toggles the fast-forward button state', () => {
    const { rerender } = renderWithLocale('en_us');

    const button = screen.getByTitle('Fast forward tool execution approvals');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    rerender(
      <I18nContext.Provider
        value={{
          languageSetting: 'en_us',
          resolvedLocale: 'en_us',
          setLanguageSetting: async () => undefined,
          t: (key, params) => translate(key, params, 'en_us'),
        }}
      >
        <ChatBox isVisible={true} />
      </I18nContext.Provider>,
    );

    expect(screen.getByTitle('Fast forward tool execution approvals')).toHaveAttribute('aria-pressed', 'true');
  });

  it('resets fast-forward through the shared new chat clear path', () => {
    projectStoreState.toolFastForwardEnabled = true;
    clearChatHistoryAndUIMock.mockImplementation(() => {
      projectStoreState.setToolFastForwardEnabled(false);
    });

    const { rerender } = renderWithLocale('en_us');
    fireEvent.click(screen.getByTitle('New Chat'));

    rerender(
      <I18nContext.Provider
        value={{
          languageSetting: 'en_us',
          resolvedLocale: 'en_us',
          setLanguageSetting: async () => undefined,
          t: (key, params) => translate(key, params, 'en_us'),
        }}
      >
        <ChatBox isVisible={true} />
      </I18nContext.Provider>,
    );

    expect(clearChatHistoryAndUIMock).toHaveBeenCalled();
    expect(screen.getByTitle('Fast forward tool execution approvals')).toHaveAttribute('aria-pressed', 'false');
  });
});
