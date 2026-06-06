import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../stores/projectStore', () => ({
  useProjectStore: {
    getState: () => ({
      refreshProjectState: vi.fn(),
    }),
  },
}));

import { AgentCore } from '../core/AgentCore';
import { UpdateTodoListTool } from './UpdateTodoListTool';

describe('UpdateTodoListTool', () => {
  beforeEach(() => {
    AgentCore.instance().clearConversation();
  });

  it('accepts a valid full-list replacement and updates agent state', async () => {
    const tool = new UpdateTodoListTool();

    const result = await tool.execute({
      items: [
        { id: '1', text: 'Inspect current region', status: 'completed' },
        { id: '2', text: 'Draft harmony', status: 'in_progress', activeText: 'Drafting harmony' },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.result).toContain('(1/2 completed)');
    expect(AgentCore.instance().getAgentState().getTodos()).toEqual([
      expect.objectContaining({ id: '1', text: 'Inspect current region', status: 'completed' }),
      expect.objectContaining({ id: '2', text: 'Draft harmony', status: 'in_progress', activeText: 'Drafting harmony' }),
    ]);
  });

  it('rejects empty todo text', async () => {
    const tool = new UpdateTodoListTool();

    const result = await tool.execute({
      items: [
        { id: '1', text: '   ', status: 'pending' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('text is required');
  });

  it('rejects invalid statuses', async () => {
    const tool = new UpdateTodoListTool();

    const result = await tool.execute({
      items: [
        { id: '1', text: 'Task', status: 'active' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain("invalid status 'active'");
  });

  it('rejects duplicate ids', async () => {
    const tool = new UpdateTodoListTool();

    const result = await tool.execute({
      items: [
        { id: '1', text: 'Task A', status: 'pending' },
        { id: '1', text: 'Task B', status: 'pending' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('duplicate id');
  });

  it('rejects multiple in-progress items', async () => {
    const tool = new UpdateTodoListTool();

    const result = await tool.execute({
      items: [
        { id: '1', text: 'Task A', status: 'in_progress' },
        { id: '2', text: 'Task B', status: 'in_progress' },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.result).toContain('Only one todo item can be in_progress');
  });
});
