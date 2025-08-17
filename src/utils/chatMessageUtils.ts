import { processUserMessage } from '../util/messageFilter/UserMessageFilter';
import type { ChatMessage } from '../types/projectTypes';

export const generateMessageId = (): string => {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

export const createMessage = (role: 'user' | 'assistant', content: string): ChatMessage => {
  return {
    id: generateMessageId(),
    role,
    content,
  };
};

export const createStreamingMessage = (content: string = '<span class="processing-wave">Processing...</span> 0 tokens received. click here to abort.'): ChatMessage => {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    isStreaming: true,
    tokenCount: 0,
  };
};

export const createToolResultMessage = (toolName: string, success: boolean, result: string): ChatMessage => {
  const friendlyDisplay = `${success ? '✅' : '❌'} __**${toolName}**__ \n\n └── ${result}`;
  return createMessage('user', friendlyDisplay);
};

export const addWelcomeMessage = async (): Promise<ChatMessage | null> => {
  try {
    const result = await processUserMessage('/welcome');
    if (result.pseudoAssistantResponse) {
      return createMessage('assistant', result.pseudoAssistantResponse);
    }
    return null;
  } catch {
    // ignore errors, just don't show welcome if it fails
    return null;
  }
};