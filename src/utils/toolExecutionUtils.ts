import { XMLToolExecutor } from '../agent/core/XMLToolExecutor';
import { extractXMLFromString } from '../util/xmlUtil';
import { createToolResultMessage } from './chatMessageUtils';
import type { ChatMessage } from '../types/projectTypes';

interface ToolExecutionResult {
  success: boolean;
  result: string;
}

interface ToolExecutionOptions {
  onMessageAdd: (message: ChatMessage) => void;
  onStatusUpdate: (status: string) => void;
}

export const extractActionableTools = (response: string): string[] => {
  const xmlBlocks = extractXMLFromString(response);
  // Consider only actionable tools (exclude think/thinking)
  return xmlBlocks.filter((block) => {
    const match = block.match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
    const name = match ? match[1].toLowerCase() : '';
    return name !== 'think' && name !== 'thinking';
  });
};

export const extractToolName = (xmlBlock: string): string => {
  const toolNameMatch = xmlBlock.match(/<([a-zA-Z_][a-zA-Z0-9_-]*)/);
  return toolNameMatch ? toolNameMatch[1] : 'unknown_tool';
};

export const executeSingleTool = async (
  xmlBlock: string,
  toolName: string,
  options: ToolExecutionOptions
): Promise<ToolExecutionResult> => {
  const { onMessageAdd } = options;
  
  try {
    const executor = XMLToolExecutor.instance();
    const results = await executor.executeXMLTools(xmlBlock);
    const result = results[0]; // Single block should give single result
    
    if (result) {
      // Add friendly display message
      const toolMessage = createToolResultMessage(toolName, result.success, result.result);
      onMessageAdd(toolMessage);
      
      return {
        success: result.success,
        result: result.result
      };
    }
    
    return {
      success: false,
      result: 'No result returned from tool execution'
    };
  } catch (error) {
    // Handle individual tool error
    const errorMessage = `Tool execution failed: ${error}`;
    const toolMessage = createToolResultMessage(toolName, false, errorMessage);
    onMessageAdd(toolMessage);
    
    return {
      success: false,
      result: errorMessage
    };
  }
};

export const formatToolResultForLLM = (toolName: string, result: ToolExecutionResult): string => {
  // Skip thinking tools
  if (toolName === 'thinking' || toolName === 'think') {
    return '';
  }
  
  return `tool: ${toolName}\nsuccess: ${result.success}\nresult:\n${result.result}\n------------\n`;
};

export const executeAllTools = async (
  actionableBlocks: string[],
  options: ToolExecutionOptions
): Promise<string> => {
  const { onStatusUpdate } = options;
  
  onStatusUpdate(`Executing ${actionableBlocks.length} tool(s)...`);
  
  let accumulatedResults = '';
  
  // Execute tools sequentially with real-time updates
  for (let i = 0; i < actionableBlocks.length; i++) {
    onStatusUpdate(`Executing tool ${i + 1} of ${actionableBlocks.length}...`);
    
    const toolName = extractToolName(actionableBlocks[i]);
    const result = await executeSingleTool(actionableBlocks[i], toolName, options);
    
    // Accumulate formatted result for LLM
    accumulatedResults += formatToolResultForLLM(toolName, result);
  }
  
  return accumulatedResults;
};