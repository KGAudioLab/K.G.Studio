import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processUserMessage } from './UserMessageFilter';
import { addWelcomeMessage } from '../../utils/chatMessageUtils';

const configState = new Map<string, unknown>();

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
    getState: () => ({
      setStatus: vi.fn(),
      activeRegionId: null,
      selectedRegionIds: [],
    }),
  },
}));

vi.mock('../../agent/core/SystemPrompts', () => ({
  SystemPrompts: {
    getPromptWithContext: vi.fn(async (value: string) => value),
  },
}));

describe('processUserMessage /welcome', () => {
  beforeEach(() => {
    configState.clear();
    configState.set('general.llm_provider', 'local_browser');
    configState.set('general.openai.api_key', '');
    configState.set('general.gemini.api_key', '');
    configState.set('general.claude.api_key', '');
    configState.set('general.claude_openrouter.api_key', '');
    configState.set('general.openai_compatible.base_url', '');
    configState.set('general.openai_compatible.model', '');

    configManagerMock.getIsInitialized.mockReturnValue(true);
    configManagerMock.initialize.mockClear();
    configManagerMock.get.mockClear();

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
});
