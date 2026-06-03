import { useState, useCallback } from 'react';
import { AgentCore } from '../agent/core/AgentCore';
import { AVAILABLE_TOOLS } from '../agent/tools';
import { createStreamingMessage, createMessage } from '../utils/chatMessageUtils';
import type { ChatMessage } from '../types/projectTypes';

const TODO_TOOL_NAME = 'update_todo_list';

interface PendingToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown> | null;
}

const buildToolResultDisplayContent = (
  toolName: string,
  success: boolean,
  rawResult: string,
  toolArgs: Record<string, unknown> | null,
): string => {
  if (!success) {
    return rawResult;
  }

  const ToolClass = AVAILABLE_TOOLS[toolName as keyof typeof AVAILABLE_TOOLS];
  if (!ToolClass) {
    return rawResult;
  }

  try {
    const toolInstance = new ToolClass();
    return toolInstance.buildToolResultDisplayContent(toolArgs, { success, result: rawResult }) ?? rawResult;
  } catch {
    return rawResult;
  }
};

interface StreamProcessorOptions {
  onMessageUpdate: (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  onMessageAdd: (message: ChatMessage) => void;
  onMessageRemove: (messageId: string) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

interface StreamProcessorResult {
  processStream: (input: string, logPrefix?: string) => Promise<string>;
  abortController: AbortController | null;
  isProcessing: boolean;
}

const PROCESSING_WAVE = '<span class="processing-wave">Processing...</span>';

export const useStreamProcessor = (options: StreamProcessorOptions): StreamProcessorResult => {
  const { onMessageUpdate, onMessageAdd, onMessageRemove, onProcessingChange } = options;
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processStream = useCallback(async (input: string, logPrefix: string = 'USER'): Promise<string> => {
    setIsProcessing(true);
    onProcessingChange(true);

    const controller = new AbortController();
    setAbortController(controller);

    // Track the current streaming message ID (mutable)
    const initialStreamingMsg = createStreamingMessage();
    let currentStreamingId = initialStreamingMsg.id;
    const pendingToolCalls: PendingToolCall[] = [];
    onMessageAdd(initialStreamingMsg);

    try {
      const agentCore = AgentCore.instance();
      let assistantResponse = '';
      let tokenCount = 0;
      let hasTextContent = false;
      let performanceInfo: ChatMessage['performanceInfo'];

      console.log(`------------ ${logPrefix} ------------`);
      console.log(input);
      console.log('------------------------------');

      for await (const chunk of agentCore.processUserInput(input)) {
        if (controller.signal.aborted) {
          return '';
        }

        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
          tokenCount++;
          hasTextContent = true;

          onMessageUpdate(currentStreamingId, (msg) => ({
            ...msg,
            content: `${PROCESSING_WAVE}${tokenCount > 0 ? ` ${tokenCount} tokens received.` : ''} click here to abort.`,
            tokenCount
          }));
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          console.log('------------ ASSISTANT TOOL CALL ------------');
          console.log(JSON.stringify(chunk.toolCall, null, 2));
          console.log('---------------------------------------------');

          // Finalize or remove the current streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined,
              performanceInfo
            }));

            console.log('------------ ASSISTANT ------------');
            console.log(assistantResponse);
            console.log('-----------------------------------');
          } else {
            // No text before this tool call — remove the empty streaming placeholder
            onMessageRemove(currentStreamingId);
          }

          // Show tool call in UI
          const toolName = chunk.toolCall.function.name;
          if (toolName === TODO_TOOL_NAME) {
            continue;
          }
          let argsDisplay = '';
          try {
            const args = JSON.parse(chunk.toolCall.function.arguments);
            argsDisplay = JSON.stringify(args, null, 2);
            pendingToolCalls.push({ id: chunk.toolCall.id, name: toolName, arguments: args });
          } catch {
            argsDisplay = chunk.toolCall.function.arguments;
            pendingToolCalls.push({ id: chunk.toolCall.id, name: toolName, arguments: null });
          }
          const toolCallMsg = {
            ...createMessage('assistant', `🔧 **Calling tool: ${toolName}**\n\n\`\`\`json\n${argsDisplay}\n\`\`\``),
            isToolCallMessage: true,
          };
          onMessageAdd(toolCallMsg);
        } else if (chunk.type === 'tool_result' && chunk.toolResult) {
          console.log('------------ TOOL RESULT ------------');
          console.log(JSON.stringify(chunk.toolResult, null, 2));
          console.log('-------------------------------------');

          // Show tool result in UI
          const { toolCallId, name, success, result } = chunk.toolResult;
          const pendingToolCallIndex = pendingToolCalls.findIndex(toolCall => toolCall.id === toolCallId);
          const pendingToolCall = pendingToolCallIndex >= 0
            ? pendingToolCalls.splice(pendingToolCallIndex, 1)[0]
            : undefined;
          const toolResultDisplayContent = buildToolResultDisplayContent(
            name,
            success,
            result,
            pendingToolCall?.arguments ?? null,
          );
          const toolResultMsg = name === TODO_TOOL_NAME
            ? {
              ...createMessage('assistant', result),
              toolName: name,
              toolSuccess: success,
              todoSnapshot: AgentCore.instance().getAgentState().getTodos().map(todo => ({ ...todo })),
            }
            : {
              ...createMessage('assistant', `${success ? '✅' : '❌'} **${name}**\n\n └── ${result}`),
              toolName: name,
              toolSuccess: success,
              toolRawResult: result,
              toolResultDisplayContent,
            };
          onMessageAdd(toolResultMsg);

          // Reset for the next LLM turn in the agentic loop
          assistantResponse = '';
          tokenCount = 0;
          hasTextContent = false;
          performanceInfo = undefined;

          // Create a fresh streaming placeholder for the next LLM response
          const nextMsg = createStreamingMessage();
          currentStreamingId = nextMsg.id;
          onMessageAdd(nextMsg);
        } else if (chunk.type === 'done') {
          performanceInfo = chunk.performanceInfo;
          // Finalize the streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined,
              performanceInfo
            }));
          } else {
            // No text in final response — remove empty placeholder
            onMessageRemove(currentStreamingId);
          }

          console.log('------------ ASSISTANT ------------');
          console.log(assistantResponse);
          console.log('-----------------------------------');
          break;
        }
      }

      return assistantResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return '';
      }

      console.error('Error processing stream:', error);
      onMessageUpdate(currentStreamingId, (msg) => ({
        ...msg,
        content: `Error: ${error instanceof Error ? error.message : 'Failed to process message'}`,
        isStreaming: false,
        tokenCount: undefined
      }));
      throw error;
    } finally {
      setAbortController(null);
      setIsProcessing(false);
      onProcessingChange(false);
    }
  }, [onMessageUpdate, onMessageAdd, onMessageRemove, onProcessingChange]);

  return {
    processStream,
    abortController,
    isProcessing
  };
};
