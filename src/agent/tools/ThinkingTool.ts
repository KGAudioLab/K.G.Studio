import { BaseTool } from './BaseTool';
import type { ToolResult, ToolParameter } from './BaseTool';

/**
 * Pseudo tool for handling <thinking> tags in LLM responses
 * This tool displays the thinking content in the UI but doesn't send results back to the LLM
 * Handles XML format: <thinking>any content here</thinking>
 */
export class ThinkingTool extends BaseTool {
  readonly name = 'thinking';
  readonly description = 'Pseudo tool for handling LLM thinking content. Shows content in UI but does not send results back to LLM.';
  
  readonly parameters: Record<string, ToolParameter> = {
    content: {
      type: 'string',
      description: 'The thinking content from the XML tag',
      required: false
    }
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Extract the thinking content from the parameters
      // const content = params.content as string || '';
      
      // Return the thinking content as a successful result
      // This will be displayed in the UI but not sent back to the LLM
      return this.createSuccessResult("Thinking completed.");
      
    } catch (error) {
      return this.createErrorResult(`Failed to process thinking content: ${error}`);
    }
  }
}