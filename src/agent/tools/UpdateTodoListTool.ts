import { AgentCore } from '../core/AgentCore';
import { renderTodoList, summarizeTodoCounts, validateAndNormalizeTodos, type TodoInputItem } from '../core/todo';
import { BaseTool } from './BaseTool';
import type { ToolParameter, ToolResult } from './BaseTool';

export class UpdateTodoListTool extends BaseTool {
  readonly name = 'update_todo_list';
  readonly description = 'Replace the current task checklist for multi-step work and keep progress updated.';
  readonly parameters: Record<string, ToolParameter> = {
    items: {
      type: 'array',
      description: 'The full todo list to keep for the current task.',
      required: true,
      items: {
        type: 'object',
        description: 'A single todo item.',
        properties: {
          id: {
            type: 'string',
            description: 'Stable task id.',
          },
          text: {
            type: 'string',
            description: 'User-visible task description.',
            required: true,
          },
          status: {
            type: 'string',
            description: 'Current task status.',
            required: true,
            enum: ['pending', 'in_progress', 'completed'],
          },
          activeText: {
            type: 'string',
            description: 'Optional present-tense wording to show while the task is in progress.',
          },
        },
      },
    },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      this.validateParameters(params);

      const items = (params.items as TodoInputItem[]) ?? [];
      const todos = validateAndNormalizeTodos(items);
      AgentCore.instance().getAgentState().setTodos(todos);

      const counts = summarizeTodoCounts(todos);
      const rendered = renderTodoList(todos);

      return this.createSuccessResult(
        `${rendered}\n\nTotal: ${counts.total}, in progress: ${counts.inProgress}, pending: ${counts.pending}, completed: ${counts.completed}`,
      );
    } catch (error) {
      return this.createErrorResult(error instanceof Error ? error.message : 'Failed to update todo list');
    }
  }
}
