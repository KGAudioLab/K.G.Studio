import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';
import { AgentCore } from '../core/AgentCore';

/**
 * Tool for signaling task completion
 * This is a pure agent state tool that doesn't modify the DAW but signals
 * to the agent system that the user's requested task has been completed
 */
export class AttemptCompletionTool extends BaseTool {
  readonly name = 'attempt_completion';
  readonly description = 'Signal that the current user task is fully complete. Only use this when you have successfully fulfilled all aspects of the user\'s request.';
  
  readonly parameters: Record<string, ToolParameter> = {
    comment: {
      type: 'string',
      description: 'A brief comment describing what was completed and any relevant details about the task fulfillment.',
      required: true
    }
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Validate parameters
      this.validateParameters(params);
      
      const comment = params.comment as string;
      
      // Validate comment is not empty
      if (!comment.trim()) {
        return this.createErrorResult('Comment cannot be empty. Please provide a meaningful completion summary.');
      }
      
      // Get current agent state and update task completion status
      const agentCore = AgentCore.instance();
      const agentState = agentCore.getAgentState();
      
      // Mark that we're no longer working on a task
      agentState.setIsWorkingOnTask(false);
      
      return this.createSuccessResult(
        `Task completed: ${comment}. Agent task status updated to not working.`
      );
      
    } catch (error) {
      return this.createErrorResult(`Failed to mark task as complete: ${error}`);
    }
  }
}