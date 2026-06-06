import type { Message } from '../agent/core/AgentState';
import type { TodoItem } from '../agent/core/todo';
import type { ChatMessage } from './projectTypes';

export const SAVED_CONVERSATION_VERSION = 1;

export interface SavedConversationMeta {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastTurnAt: number;
  messageCount: number;
  preview: string;
}

export interface SavedConversationDocument {
  version: number;
  conversationId: string;
  continuationState: {
    messages: Message[];
    todos: TodoItem[];
  };
  fullHistory: {
    messages: Message[];
  };
  displayTranscript: ChatMessage[];
}
