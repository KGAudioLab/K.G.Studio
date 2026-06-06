/**
 * Manages the state of an agent conversation
 */
import type { TodoItem } from './todo';

/**
 * Tool call info attached to assistant messages (OpenAI function calling format)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string of parameters
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  timestamp: number;
  tool_calls?: ToolCall[];    // present on assistant messages when LLM invokes tools
  tool_call_id?: string;      // present on tool-result messages, links back to ToolCall.id
  is_compacted_summary?: boolean;
  compact_trigger?: 'manual' | 'auto';
}

export class AgentState {
  private messages: Message[] = [];
  private fullMessages: Message[] = [];
  private todos: TodoItem[] = [];
  private conversationId: string;
  private isWorkingOnTask: boolean = false;
  private todoListeners: Set<() => void> = new Set();

  constructor(conversationId?: string, isWorkingOnTask: boolean = false) {
    this.conversationId = conversationId || this.generateConversationId();
    this.isWorkingOnTask = isWorkingOnTask;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(
    role: 'user' | 'assistant' | 'tool',
    content: string | null,
    options?: {
      tool_calls?: ToolCall[];
      tool_call_id?: string;
      is_compacted_summary?: boolean;
      compact_trigger?: 'manual' | 'auto';
    }
  ): string {
    const message: Message = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: Date.now(),
      ...(options?.tool_calls ? { tool_calls: options.tool_calls } : {}),
      ...(options?.tool_call_id ? { tool_call_id: options.tool_call_id } : {}),
      ...(options?.is_compacted_summary ? { is_compacted_summary: true } : {}),
      ...(options?.compact_trigger ? { compact_trigger: options.compact_trigger } : {}),
    };

    this.messages.push(message);
    this.fullMessages.push({ ...message });
    return message.id;
  }

  /**
   * Update the content of a message by ID
   */
  updateMessage(messageId: string, content: string | null, options?: { tool_calls?: ToolCall[] }): boolean {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].content = content;
      if (options?.tool_calls) {
        this.messages[messageIndex].tool_calls = options.tool_calls;
      }
    }

    const fullMessageIndex = this.fullMessages.findIndex(msg => msg.id === messageId);
    if (fullMessageIndex !== -1) {
      this.fullMessages[fullMessageIndex].content = content;
      if (options?.tool_calls) {
        this.fullMessages[fullMessageIndex].tool_calls = options.tool_calls;
      }
    }

    if (messageIndex !== -1 || fullMessageIndex !== -1) {
      return true;
    }
    return false;
  }

  /**
   * Remove a message by ID
   */
  removeMessage(messageId: string): boolean {
    const messageIndex = this.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      this.messages.splice(messageIndex, 1);
    }

    const fullMessageIndex = this.fullMessages.findIndex(msg => msg.id === messageId);
    if (fullMessageIndex !== -1) {
      this.fullMessages.splice(fullMessageIndex, 1);
    }

    if (messageIndex !== -1 || fullMessageIndex !== -1) {
      return true;
    }
    return false;
  }

  /**
   * Remove the last N messages
   */
  removeLastMessages(count: number): void {
    this.messages.splice(-count, count);
    this.fullMessages.splice(-count, count);
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  getFullMessages(): Message[] {
    return [...this.fullMessages];
  }

  /**
   * Get the conversation ID
   */
  getConversationId(): string {
    return this.conversationId;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
    this.fullMessages = [];
    this.clearTodos();
  }

  replaceMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  replaceConversationState(state: {
    conversationId: string;
    messages: Message[];
    fullMessages: Message[];
    todos: TodoItem[];
  }): void {
    this.conversationId = state.conversationId;
    this.messages = state.messages.map(message => ({ ...message }));
    this.fullMessages = state.fullMessages.map(message => ({ ...message }));
    this.setTodos(state.todos);
  }

  resetConversation(conversationId?: string): void {
    this.conversationId = conversationId || this.generateConversationId();
    this.messages = [];
    this.fullMessages = [];
    this.clearTodos();
  }

  /**
   * Get the last N messages
   */
  getRecentMessages(count: number): Message[] {
    return this.messages.slice(-count);
  }

  findRecentTailStartIndex(): number {
    for (let i = this.messages.length - 1; i >= 0; i -= 1) {
      if (this.messages[i].role === 'user') {
        return i;
      }
    }
    return this.messages.length;
  }

  createCompactedHistory(summary: string, tailStartIndex: number, trigger: 'manual' | 'auto'): Message[] {
    const preservedTail = this.messages.slice(Math.max(0, tailStartIndex));
    const summaryMessage: Message = {
      id: this.generateMessageId(),
      role: 'assistant',
      content: summary,
      timestamp: Date.now(),
      is_compacted_summary: true,
      compact_trigger: trigger,
    };

    return [summaryMessage, ...preservedTail];
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // getters and setters
  getIsWorkingOnTask(): boolean {
    return this.isWorkingOnTask;
  }

  setIsWorkingOnTask(isWorkingOnTask: boolean): void {
    this.isWorkingOnTask = isWorkingOnTask;
  }

  getTodos(): TodoItem[] {
    return this.todos.map(todo => ({ ...todo }));
  }

  setTodos(todos: TodoItem[]): void {
    this.todos = todos.map(todo => ({ ...todo }));
    this.notifyTodoListeners();
  }

  clearTodos(): void {
    if (this.todos.length === 0) {
      return;
    }
    this.todos = [];
    this.notifyTodoListeners();
  }

  subscribeTodoChanges(listener: () => void): () => void {
    this.todoListeners.add(listener);
    return () => {
      this.todoListeners.delete(listener);
    };
  }

  private notifyTodoListeners(): void {
    for (const listener of this.todoListeners) {
      listener();
    }
  }
}
