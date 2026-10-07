import { beforeEach, describe, expect, it, vi } from 'vitest';
const { openaiMock, createMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  openaiMock: vi.fn(),
}));
vi.mock('openai', () => ({ default: openaiMock }));
import { OpenAICompatibleLLMProvider } from './LLMProvider';

describe('OpenAICompatibleLLMProvider connection configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue((async function* () {})());
    openaiMock.mockImplementation(() => ({ chat: { completions: { create: createMock } } }));
  });
  it.each([
    ['https://api.openai.com/v1', 'https://api.openai.com/v1'],
    ['https://openrouter.ai/api/v1/chat/completions', 'https://openrouter.ai/api/v1'],
    ['http://localhost:11434/v1/chat/completions/', 'http://localhost:11434/v1'],
    ['http://localhost:8080/v1', 'http://localhost:8080/v1'],
  ])('accepts %s with an empty key', (url, baseURL) => {
    new OpenAICompatibleLLMProvider('', 'model', url);
    expect(openaiMock).toHaveBeenCalledExactlyOnceWith({ apiKey: '', baseURL, dangerouslyAllowBrowser: true });
  });
  it.each(['medium', 'high', 'max', 'custom-effort'])('passes editable thinking level %s with tool calling', async level => {
    const provider = new OpenAICompatibleLLMProvider('', 'model', 'http://localhost:8080/v1', level);
    const tools = [{ type: 'function' as const, function: { name: 'test', description: 'Test', parameters: { type: 'object' as const, properties: {} } } }];
    for await (const chunk of provider.generateStream([], undefined, tools)) void chunk;
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: level, tools, tool_choice: 'auto', stream: true }));
  });

  it.each([undefined, '', '   '])('omits reasoning effort for %s', async level => {
    const provider = new OpenAICompatibleLLMProvider('', 'model', undefined, level);
    for await (const chunk of provider.generateStream([])) void chunk;
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
  });

});
