import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCore } from './AgentCore';
import type { LLMProvider } from '../llm/LLMProvider';
import type { Message, ToolCall } from './AgentState';
import type { StreamChunk } from '../llm/StreamingTypes';
import type { OpenAIToolDefinition } from '../tools/BaseTool';
import { ReadMusicTool } from '../tools/ReadMusicTool';

const configState = new Map<string, unknown>([
  ['general.agent_mode', 'regular'],
  ['general.llm_provider', 'openai'],
  ['general.auto_compact_threshold_percent', 90],
]);

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      refreshProjectState: vi.fn(),
    }),
  },
}));

vi.mock('./SystemPrompts', () => ({
  SystemPrompts: {
    getSystemPromptWithContext: vi.fn(async (templatePath?: string) => `system prompt:${templatePath ?? 'default'}`),
  },
}));

vi.mock('../../core/config/ConfigManager', () => ({
  ConfigManager: {
    instance: () => ({
      getIsInitialized: () => true,
      initialize: vi.fn(async () => undefined),
      get: (key: string) => configState.get(key),
    }),
  },
}));

class ScriptedProvider implements LLMProvider {
  public calls: Message[][] = [];
  public systemPrompts: Array<string | undefined> = [];
  public tools: OpenAIToolDefinition[][] = [];

  constructor(private readonly scripts: StreamChunk[][]) {}

  async *generateStream(
    messages: Message[],
    systemPrompt?: string,
    tools?: OpenAIToolDefinition[],
  ): AsyncIterableIterator<StreamChunk> {
    this.calls.push(messages.map(message => ({ ...message })));
    this.systemPrompts.push(systemPrompt);
    this.tools.push(tools ?? []);
    const script = this.scripts.shift() ?? [{ type: 'done', content: '', finishReason: 'stop' }];
    for (const chunk of script) {
      yield chunk;
    }
  }
}

function makeToolCall(name: string, args: Record<string, unknown>, id: string): ToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

async function collectChunks(input: string): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of AgentCore.instance().processUserInput(input)) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('AgentCore todo integration', () => {
  beforeEach(() => {
    configState.set('general.agent_mode', 'regular');
    configState.set('general.llm_provider', 'openai');
    configState.set('general.auto_compact_threshold_percent', 90);
    AgentCore.instance().clearConversation();
    AgentCore.instance().setLLMProvider(new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]));
  });

  it('updates todo state through the update_todo_list tool during the agent loop', async () => {
    const provider = new ScriptedProvider([
      [
        {
          type: 'tool_call',
          content: '',
          toolCall: makeToolCall('update_todo_list', {
            items: [
              { id: '1', text: 'Read current music', status: 'completed' },
              { id: '2', text: 'Write counter melody', status: 'in_progress' },
            ],
          }, 'todo_1'),
        },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Done' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Plan and update the region in multiple steps.');

    expect(AgentCore.instance().getAgentState().getTodos()).toEqual([
      expect.objectContaining({ id: '1', text: 'Read current music', status: 'completed' }),
      expect.objectContaining({ id: '2', text: 'Write counter melody', status: 'in_progress' }),
    ]);
  });

  it('injects a hidden reminder after tool work goes stale with an active checklist', async () => {
    AgentCore.instance().getAgentState().setTodos([
      { id: '1', text: 'Analyze melody', status: 'in_progress', updatedAt: 1 },
    ]);
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('unknown_tool', {}, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('unknown_tool', {}, 'tool_2') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Final reply' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Please analyze and revise this passage.');

    expect(provider.calls[2][provider.calls[2].length - 1]?.content).toContain('Keep the task list current');
  });

  it('does not inject the reminder for a simple one-shot turn without todos', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('unknown_tool', {}, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Final reply' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Read the current region.');

    expect(provider.calls[1][provider.calls[1].length - 1]?.content).not.toContain('Keep the task list current');
  });

  it('requests approval for non-read-only tools and continues after allow', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('add_notes', { notes: [{ pitch: 'C4', start: 0, length: 1 }] }, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Completed' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    const requestToolApproval = vi.fn(async () => 'allow' as const);
    const chunks: StreamChunk[] = [];
    for await (const chunk of AgentCore.instance().processUserInput('Write notes', { requestToolApproval })) {
      chunks.push(chunk);
    }

    expect(requestToolApproval).toHaveBeenCalledTimes(1);
    expect(chunks.some(chunk => chunk.type === 'tool_result' && chunk.toolResult?.name === 'add_notes')).toBe(true);
    expect(chunks.at(-1)?.type).toBe('done');
  });

  it('records denied tool execution and stops the turn after deny', async () => {
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('add_notes', { notes: [{ pitch: 'C4', start: 0, length: 1 }] }, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Should not run' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    const chunks: StreamChunk[] = [];
    for await (const chunk of AgentCore.instance().processUserInput('Write notes', {
      requestToolApproval: async () => 'deny',
    })) {
      chunks.push(chunk);
    }

    const deniedChunk = chunks.find(chunk => chunk.type === 'tool_result' && chunk.toolResult?.name === 'add_notes');
    expect(deniedChunk?.toolResult?.denied).toBe(true);
    expect(deniedChunk?.toolResult?.result).toBe('Execution was denied by the user.');
    expect(provider.calls).toHaveLength(1);
    expect(AgentCore.instance().getAgentState().getMessages().at(-1)?.role).toBe('tool');
  });

  it('restores a saved conversation document into the agent state', () => {
    AgentCore.instance().restoreConversation({
      version: 1,
      conversationId: 'conv_saved',
      continuationState: {
        messages: [
          { id: 'm2', role: 'assistant', content: 'summary', timestamp: 2 },
        ],
        todos: [
          { id: 'todo-1', text: 'Continue work', status: 'in_progress', updatedAt: 3 },
        ],
      },
      fullHistory: {
        messages: [
          { id: 'm1', role: 'user', content: 'prompt', timestamp: 1 },
          { id: 'm2', role: 'assistant', content: 'summary', timestamp: 2 },
        ],
      },
      displayTranscript: [],
    });

    expect(AgentCore.instance().getAgentState().getConversationId()).toBe('conv_saved');
    expect(AgentCore.instance().getAgentState().getMessages()).toHaveLength(1);
    expect(AgentCore.instance().getAgentState().getFullMessages()).toHaveLength(2);
    expect(AgentCore.instance().getAgentState().getTodos()).toEqual([
      { id: 'todo-1', text: 'Continue work', status: 'in_progress', updatedAt: 3 },
    ]);
  });

  it('uses the regular system prompt in regular mode', async () => {
    configState.set('general.agent_mode', 'regular');
    const provider = new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Read the current region.');

    expect(provider.systemPrompts[0]).toBe('system prompt:prompts/system.md');
  });

  it('exposes the new track management tools in regular mode', async () => {
    configState.set('general.agent_mode', 'regular');
    const provider = new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Inspect available tools.');

    const toolNames = provider.tools[0].map(tool => tool.function.name);
    expect(toolNames).toContain('list_all_available_instruments');
    expect(toolNames).toContain('create_new_track');
    expect(toolNames).toContain('update_track');
    expect(toolNames).toContain('write_chord_progression');
  });

  it('uses the compact system prompt in efficient mode', async () => {
    configState.set('general.agent_mode', 'efficient');
    const provider = new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Read the current region.');

    expect(provider.systemPrompts[0]).toBe('system prompt:prompts/system_compact.md');
  });

  it('forces efficient mode when the local browser provider is selected', async () => {
    configState.set('general.agent_mode', 'regular');
    configState.set('general.llm_provider', 'local_browser');
    const provider = new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Read the current region.');

    expect(provider.systemPrompts[0]).toBe('system prompt:prompts/system_compact.md');
  });

  it('filters tool definitions by the active agent mode', async () => {
    configState.set('general.agent_mode', 'efficient');
    const provider = new ScriptedProvider([
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    const spy = vi.spyOn(ReadMusicTool.prototype, 'isAvailableInEfficientMode')
      .mockReturnValue(false);

    await collectChunks('Read the current region.');

    const toolNames = provider.tools[0].map(tool => tool.function.name);
    expect(toolNames).not.toContain('read_music');
    expect(toolNames).not.toContain('list_all_available_instruments');
    expect(toolNames).not.toContain('create_new_track');
    expect(toolNames).not.toContain('update_track');
    expect(toolNames).not.toContain('write_chord_progression');
    spy.mockRestore();
  });

  it('rejects tool calls for tools unavailable in the active mode', async () => {
    configState.set('general.agent_mode', 'efficient');
    const availabilitySpy = vi.spyOn(ReadMusicTool.prototype, 'isAvailableInEfficientMode')
      .mockReturnValue(false);
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('read_music', {}, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [
        { type: 'text', content: 'Done' },
        { type: 'done', content: '', finishReason: 'stop' },
      ],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    const chunks = await collectChunks('Read the current region.');
    const toolResultChunk = chunks.find(chunk => chunk.type === 'tool_result' && chunk.toolResult?.name === 'read_music');

    expect(toolResultChunk?.toolResult?.success).toBe(false);
    expect(toolResultChunk?.toolResult?.result).toBe("Tool 'read_music' is not available in Efficient Mode.");
    availabilitySpy.mockRestore();
  });
});
