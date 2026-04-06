import { useState, useCallback } from 'react';
import { AgentCore } from '../agent/core/AgentCore';
import { createStreamingMessage, createMessage } from '../utils/chatMessageUtils';
import type { ChatMessage } from '../types/projectTypes';

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
    onMessageAdd(initialStreamingMsg);

    try {
      const agentCore = AgentCore.instance();
      let assistantResponse = '';
      let tokenCount = 0;
      let hasTextContent = false;

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
            content: `<span class="processing-wave">Thinking...</span>${tokenCount > 0 ? ` ${tokenCount} tokens received.` : ''} click here to abort.`,
            tokenCount
          }));
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          // Finalize or remove the current streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined
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
          let argsDisplay = '';
          try {
            const args = JSON.parse(chunk.toolCall.function.arguments);
            argsDisplay = JSON.stringify(args, null, 2);
          } catch {
            argsDisplay = chunk.toolCall.function.arguments;
          }
          const toolCallMsg = createMessage('assistant', `🔧 **Calling tool: ${toolName}**\n\n\`\`\`json\n${argsDisplay}\n\`\`\``);
          onMessageAdd(toolCallMsg);
        } else if (chunk.type === 'tool_result' && chunk.toolResult) {
          // Show tool result in UI
          const { name, success, result } = chunk.toolResult;
          const icon = success ? '✅' : '❌';
          const toolResultMsg = createMessage('assistant', `${icon} **${name}**\n\n └── ${result}`);
          onMessageAdd(toolResultMsg);

          // Reset for the next LLM turn in the agentic loop
          assistantResponse = '';
          tokenCount = 0;
          hasTextContent = false;

          // Create a fresh streaming placeholder for the next LLM response
          const nextMsg = createStreamingMessage();
          currentStreamingId = nextMsg.id;
          onMessageAdd(nextMsg);
        } else if (chunk.type === 'done') {
          // Finalize the streaming message
          if (hasTextContent) {
            onMessageUpdate(currentStreamingId, (msg) => ({
              ...msg,
              content: assistantResponse,
              isStreaming: false,
              tokenCount: undefined
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
      return '';
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
