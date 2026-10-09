import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCore } from './AgentCore';
import type { LLMProvider } from '../llm/LLMProvider';
import type { Message, ToolCall } from './AgentState';
import type { StreamChunk } from '../llm/StreamingTypes';
import type { OpenAIToolDefinition } from '../tools/BaseTool';
import { ReadMusicTool } from '../tools/ReadMusicTool';
import { AdvancedReadMusicTool } from '../tools/AdvancedReadMusicTool';
import { AdvancedListAllTracks } from '../tools/AdvancedListAllTracks';
import { AdvancedListAllAvailableInstruments } from '../tools/AdvancedListAllAvailableInstruments';
import { ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE } from '../tools/advancedReaderResponses';
import { ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE } from '../tools/advancedReaderResponses';
import { UpdateTrackStatusTool } from '../tools/UpdateTrackStatusTool';
import { UpdateTrackVolumeTool } from '../tools/UpdateTrackVolumeTool';
import { RemoveTrackAutomationTool } from '../tools/RemoveTrackAutomationTool';
import { UpdateTrackAutomationTool } from '../tools/UpdateTrackAutomationTool';
import { UpdateTrackPanTool } from '../tools/UpdateTrackPanTool';

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

const mixTools = [
  { name: 'update_track_status', Tool: UpdateTrackStatusTool, args: { track_id: '1', status_type: 'mute', value: true } },
  { name: 'update_track_volume', Tool: UpdateTrackVolumeTool, args: { track_id: '1', value: -6 } },
  { name: 'update_track_pan', Tool: UpdateTrackPanTool, args: { track_id: '1', value: -0.5 } },
];

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

  it.each(['regular', 'advanced', 'efficient'].flatMap(mode => mixTools.map(tool => ({ mode, ...tool }))))('gates $name exposure and execution in $mode mode', async ({ mode, name, Tool, args }) => {
    configState.set('general.agent_mode', mode);
    const execute = vi.spyOn(Tool.prototype, 'execute')
      .mockResolvedValue({ success: true, result: 'Track status updated' });
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall(name, args, 'status_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);
    const approval = vi.fn(async () => 'allow' as const);
    try {
      const chunks: StreamChunk[] = [];
      for await (const chunk of AgentCore.instance().processUserInput('Mute Lead', { requestToolApproval: approval })) chunks.push(chunk);
      const names = provider.tools[0].map(tool => tool.function.name);
      const result = chunks.find(chunk => chunk.type === 'tool_result')?.toolResult;
      if (mode === 'efficient') {
        expect(names).not.toContain(name);
        expect(execute).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, result: `Tool '${name}' is not available in Efficient Mode.` });
      } else {
        expect(names).toContain(name);
        expect(approval).toHaveBeenCalledWith(expect.objectContaining({ id: 'status_1' }), mode);
        expect(execute).toHaveBeenCalledWith(args);
        expect(result?.success).toBe(true);
      }
    } finally {
      execute.mockRestore();
    }
  });

  it.each(['regular', 'advanced'].flatMap(mode => mixTools.map(tool => ({ mode, ...tool }))))('does not execute $name after approval is denied in $mode', async ({ mode, name, Tool, args }) => {
    configState.set('general.agent_mode', mode);
    const execute = vi.spyOn(Tool.prototype, 'execute');
    const provider = new ScriptedProvider([[
      { type: 'tool_call', content: '', toolCall: makeToolCall(name, args, 'status_1') },
      { type: 'done', content: '', finishReason: 'tool_calls' },
    ]]);
    AgentCore.instance().setLLMProvider(provider);
    try {
      const chunks: StreamChunk[] = [];
      for await (const chunk of AgentCore.instance().processUserInput('Solo Lead', { requestToolApproval: async () => 'deny' })) chunks.push(chunk);
      expect(execute).not.toHaveBeenCalled();
      expect(chunks.find(chunk => chunk.type === 'tool_result')?.toolResult).toMatchObject({ success: false, denied: true });
    } finally {
      execute.mockRestore();
    }
  });

  it.each(['update_track_volume', 'update_track_pan'])('returns %s range errors to the LLM', async name => {
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall(name, { track_id: '1', value: 100 }, 'invalid_mix') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);
    await collectChunks('Change the track mix');
    const message = provider.calls[1].find(message => message.role === 'tool');
    expect(JSON.parse(message!.content as string)).toMatchObject({ success: false, result: expect.stringContaining('value must be a finite number in') });
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

  it('uses the separate advanced prompt and mode-specific schemas with the same tool names', async () => {
    const provider = new ScriptedProvider([]);
    AgentCore.instance().setLLMProvider(provider);

    await collectChunks('Inspect available tools.');
    configState.set('general.agent_mode', 'advanced');
    await collectChunks('Inspect available tools again.');

    expect(provider.systemPrompts[1]).toBe('system prompt:prompts/system_advanced.md');
    expect(provider.tools[1].map(tool => tool.function.name).filter(name => name !== 'update_track_automation' && name !== 'remove_track_automation')).toEqual(provider.tools[0].map(tool => tool.function.name));
    expect(provider.tools[1].map(tool => tool.function.name)).toContain('update_track_automation');
    expect(provider.tools[1].map(tool => tool.function.name)).toContain('remove_track_automation');
    const advancedRead = provider.tools[1].find(tool => tool.function.name === 'read_music')!;
    expect(advancedRead.function.description).toContain('structured JSON');
    expect(JSON.stringify(advancedRead.function.parameters)).toContain('tick');
  });

  it.each(['regular', 'efficient', 'advanced'] as const)('advertises and executes automation only in Advanced mode (%s)', async mode => {
    configState.set('general.agent_mode', mode);
    const execute = vi.spyOn(UpdateTrackAutomationTool.prototype, 'execute').mockResolvedValue({ success: true, result: 'updated' });
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('update_track_automation', { track_id: '1', automation_type: 'pan', position: 123, value: 0.5 }, 'automation_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);
    try {
      const chunks = await collectChunks('Automate pan.');
      const names = provider.tools[0].map(tool => tool.function.name);
      expect(names.includes('update_track_automation')).toBe(mode === 'advanced');
      expect(execute).toHaveBeenCalledTimes(mode === 'advanced' ? 1 : 0);
      expect(chunks.find(chunk => chunk.type === 'tool_result')?.toolResult?.success).toBe(mode === 'advanced');
      if (mode === 'advanced') expect(execute).toHaveBeenCalledWith(expect.objectContaining({ position: 123 }));
    } finally { execute.mockRestore(); }
  });

  it.each(['regular', 'efficient', 'advanced'] as const)('advertises and executes automation removal only in Advanced mode (%s)', async mode => {
    configState.set('general.agent_mode', mode);
    const execute = vi.spyOn(RemoveTrackAutomationTool.prototype, 'execute').mockResolvedValue({ success: true, result: 'updated' });
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('remove_track_automation', { track_id: '1', automation_type: 'pan', position: 123, length: 1 }, 'automation_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);
    try {
      const chunks = await collectChunks('Automate pan.');
      const names = provider.tools[0].map(tool => tool.function.name);
      expect(names.includes('remove_track_automation')).toBe(mode === 'advanced');
      expect(execute).toHaveBeenCalledTimes(mode === 'advanced' ? 1 : 0);
      expect(chunks.find(chunk => chunk.type === 'tool_result')?.toolResult?.success).toBe(mode === 'advanced');
      if (mode === 'advanced') expect(execute).toHaveBeenCalledWith(expect.objectContaining({ position: 123 }));
    } finally { execute.mockRestore(); }
  });

  it.each(['read_music', 'list_all_tracks', 'list_all_available_instruments'] as const)('streams %s structured JSON and serializes the result envelope once for the LLM', async name => {
    configState.set('general.agent_mode', 'advanced');
    const payload = name === 'read_music' ? { tracks: [{ track_id: 1, notes: [] }] }
      : name === 'list_all_tracks' ? ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE.result
        : ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE.result;
    const execute = name === 'read_music'
      ? vi.spyOn(AdvancedReadMusicTool.prototype, 'execute').mockResolvedValue({ success: true, result: payload })
      : name === 'list_all_tracks'
        ? vi.spyOn(AdvancedListAllTracks.prototype, 'execute').mockResolvedValue(ADVANCED_LIST_ALL_TRACKS_RESPONSE_EXAMPLE)
        : vi.spyOn(AdvancedListAllAvailableInstruments.prototype, 'execute').mockResolvedValue(ADVANCED_LIST_ALL_AVAILABLE_INSTRUMENTS_RESPONSE_EXAMPLE);
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall(name, {}, 'json_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);
    try {
      const chunks = await collectChunks('Read music.');
      expect(provider.tools[0].find(tool => tool.function.name === name)?.function.description).toContain('Response schema (JSON Schema Draft 7');
      expect(chunks.find(chunk => chunk.type === 'tool_call')?.agentMode).toBe('advanced');
      const result = chunks.find(chunk => chunk.type === 'tool_result');
      expect(result?.agentMode).toBe('advanced');
      expect(result?.toolResult?.result).toEqual(payload);
      const message = provider.calls[1].find(message => message.role === 'tool');
      expect(JSON.parse(message!.content as string)).toEqual({ success: true, result: payload });
    } finally {
      execute.mockRestore();
    }
  });

  it('passes the executing mode to approvals and stops denied advanced edits', async () => {
    configState.set('general.agent_mode', 'advanced');
    const provider = new ScriptedProvider([[
      { type: 'tool_call', content: '', toolCall: makeToolCall('add_notes', { notes: [{ pitch: 'C4', start: 960, length: 480 }] }, 'edit_1') },
      { type: 'done', content: '', finishReason: 'tool_calls' },
    ]]);
    AgentCore.instance().setLLMProvider(provider);
    const approval = vi.fn(async () => {
      configState.set('general.agent_mode', 'regular');
      return 'deny' as const;
    });
    const chunks: StreamChunk[] = [];
    for await (const chunk of AgentCore.instance().processUserInput('Add a note.', { requestToolApproval: approval })) chunks.push(chunk);
    expect(approval).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit_1' }), 'advanced');
    expect(chunks.find(chunk => chunk.type === 'tool_result')).toMatchObject({ agentMode: 'advanced', toolResult: { denied: true, success: false } });
  });

  it.each(['regular', 'advanced'])('enforces regular tool restrictions in %s mode', async (mode) => {
    configState.set('general.agent_mode', mode);
    const availabilitySpy = vi.spyOn(ReadMusicTool.prototype, 'isAvailableInRegularMode')
      .mockReturnValue(false);
    const executeSpy = vi.spyOn(ReadMusicTool.prototype, 'execute');
    const provider = new ScriptedProvider([
      [
        { type: 'tool_call', content: '', toolCall: makeToolCall('read_music', {}, 'tool_1') },
        { type: 'done', content: '', finishReason: 'tool_calls' },
      ],
      [{ type: 'done', content: '', finishReason: 'stop' }],
    ]);
    AgentCore.instance().setLLMProvider(provider);

    try {
      const chunks = await collectChunks('Read the current region.');
      expect(provider.tools[0].map(tool => tool.function.name)).not.toContain('read_music');
      const result = chunks.find(chunk => chunk.type === 'tool_result' && chunk.toolResult?.name === 'read_music');
      expect(result?.toolResult?.success).toBe(false);
      expect(result?.toolResult?.result).toBe(
        `Tool 'read_music' is not available in ${mode === 'advanced' ? 'Advanced Mode' : 'Regular Mode'}.`,
      );
      expect(executeSpy).not.toHaveBeenCalled();
    } finally {
      availabilitySpy.mockRestore();
      executeSpy.mockRestore();
    }
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

  it.each(['regular', 'advanced'])('forces efficient mode for the local browser provider with %s configured', async (mode) => {
    configState.set('general.agent_mode', mode);
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
