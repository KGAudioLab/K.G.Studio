import { useState, useCallback } from 'react';
import { AgentCore } from '../agent/core/AgentCore';
import { createStreamingMessage } from '../utils/chatMessageUtils';
import type { ChatMessage } from '../types/projectTypes';

interface StreamProcessorOptions {
  onMessageUpdate: (messageId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  onMessageAdd: (message: ChatMessage) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

interface StreamProcessorResult {
  processStream: (input: string, logPrefix?: string) => Promise<string>;
  abortController: AbortController | null;
  isProcessing: boolean;
}

export const useStreamProcessor = (options: StreamProcessorOptions): StreamProcessorResult => {
  const { onMessageUpdate, onMessageAdd, onProcessingChange } = options;
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const processStream = useCallback(async (input: string, logPrefix: string = 'USER'): Promise<string> => {
    setIsProcessing(true);
    onProcessingChange(true);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Add streaming assistant message
    const streamingMessage = createStreamingMessage();
    onMessageAdd(streamingMessage);

    try {
      const agentCore = AgentCore.instance();
      let assistantResponse = '';
      let tokenCount = 0;
      let streamCompleted = false;

      // Log the input being sent to LLM
      console.log(`------------ ${logPrefix} ------------`);
      console.log(input);
      console.log('------------------------------');

      for await (const chunk of agentCore.processUserInput(input)) {
        // Check if request was aborted
        if (controller.signal.aborted) {
          return '';
        }

        if (chunk.type === 'text') {
          assistantResponse += chunk.content;
          tokenCount++;
          
          // Update streaming message with token count and abort link
          onMessageUpdate(streamingMessage.id, (msg) => ({
            ...msg,
            content: `<span class="processing-wave">Processing...</span> ${tokenCount} tokens received. click here to abort.`,
            tokenCount
          }));
        } else if (chunk.type === 'done') {
          streamCompleted = true;
          // Replace with final response
          onMessageUpdate(streamingMessage.id, (msg) => ({
            ...msg,
            content: assistantResponse,
            isStreaming: false,
            tokenCount: undefined
          }));
          
          // Log the complete assistant response
          console.log('------------ ASSISTANT ------------');
          console.log(assistantResponse);
          console.log('-----------------------------------');
          
          break;
        }
      }

      // If stream didn't complete normally, finalize the message
      if (!streamCompleted && !controller.signal.aborted) {
        onMessageUpdate(streamingMessage.id, (msg) => ({
          ...msg,
          content: assistantResponse || 'Stream was interrupted unexpectedly',
          isStreaming: false,
          tokenCount: undefined
        }));
      }

      return assistantResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted, don't show error
        return '';
      }
      
      console.error('Error processing stream:', error);
      // Update with error message
      onMessageUpdate(streamingMessage.id, (msg) => ({
        ...msg,
        content: 'Error: Failed to process message',
        isStreaming: false,
        tokenCount: undefined
      }));
      return '';
    } finally {
      setAbortController(null);
      setIsProcessing(false);
      onProcessingChange(false);
    }
  }, [onMessageUpdate, onMessageAdd, onProcessingChange]);

  return {
    processStream,
    abortController,
    isProcessing
  };
};